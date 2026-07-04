const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3500;
const LLAMA_SERVER = process.env.LLAMA_SERVER || 'http://localhost:8090';

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ───────────────────────────────────────────────
function isImageFile(file) {
  const ext = file.originalname.split('.').pop().toLowerCase();
  const allowed = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp'];
  return allowed.includes(ext) || file.mimetype.startsWith('image/');
}
function isVideoFile(file) {
  const ext = file.originalname.split('.').pop().toLowerCase();
  const allowed = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'quicktime'];
  return allowed.includes(ext) || file.mimetype.startsWith('video/');
}

// ── File upload setup ───────────────────────────────────────
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 500 * 1024 * 1024 }
});

// ── Frame extraction from video ─────────────────────────────
function extractFrames(videoPath, fps = 1, maxWidth = 448, maxFrames = 70) {
  return new Promise((resolve, reject) => {
    execFile('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', videoPath
    ], { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        return reject(new Error('ffprobe failed'));
      }

      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        return reject(new Error('Invalid video duration'));
      }

      let total = Math.floor(duration * fps);
      if (total % 2 !== 0) total--;
      if (total < 2) total = 2;
      if (total > maxFrames) total = maxFrames;

      const actualFps = (total / duration).toFixed(4);
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-lama-'));

      execFile('ffmpeg', [
        '-y', '-i', videoPath,
        '-vf', `fps=${actualFps},scale=${maxWidth}:-1`,
        '-q:v', '3',
        path.join(tmpDir, 'frame_%04d.jpg')
      ], { timeout: 120000 }, (err) => {
        if (err) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          return reject(new Error(`ffmpeg failed: ${err.message}`));
        }

        fs.readdir(tmpDir, (err, files) => {
          if (err) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            return reject(err);
          }

          const frameFiles = files
            .filter(f => /^frame_\d+\.jpg$/.test(f))
            .sort();

          resolve({
            dir: tmpDir,
            count: frameFiles.length,
            duration,
            fps: actualFps,
            files: frameFiles.map(f => path.join(tmpDir, f))
          });
        });
      });
    });
  });
}

// ── Call llama.cpp API ──────────────────────────────────────
async function sendToLlama(frames, question, stream = false) {
  const content = [];

  for (const framePath of frames) {
    const b64 = fs.readFileSync(framePath).toString('base64');
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${b64}` }
    });
  }

  content.push({ type: 'text', text: question });

  const res = await fetch(`${LLAMA_SERVER}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'Qwen2.5-VL-3B',
      messages: [{ role: 'user', content }],
      max_tokens: 2048,
      temperature: 0.3,
      stream
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`llama.cpp error (${res.status}): ${errText.slice(0, 500)}`);
  }

  return res;
}

// ── Streaming route ─────────────────────────────────────────
app.post('/api/chat/stream', upload.array('files', 20), async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one file is required' });
  }

  try {
    const images = req.files.filter(isImageFile);
    const videos = req.files.filter(isVideoFile);

    let frames = [];
    let videoInfo = null;

    // Extract from videos
    for (const vid of videos) {
      const result = await extractFrames(vid.path, 1, 448, 70);
      videoInfo = {
        name: vid.originalname,
        duration: result.duration.toFixed(1) + 's',
        frames: result.count
      };
      frames.push(...result.files);
    }

    // Add images directly
    for (const img of images) {
      frames.push(img.path);
    }

    if (frames.length === 0) {
      return res.status(400).json({ error: 'No valid image/video files' });
    }

    // Send metadata first
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`event: metadata\ndata: ${JSON.stringify({
      type: 'metadata',
      frames: frames.length,
      video: videoInfo,
      estimated_tokens: frames.length * 450
    })}\n\n`);

    let fullResponse = '';
    let outputTokens = 0;

    try {
      const llamaRes = await sendToLlama(frames, prompt, true);
      const reader = llamaRes.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices?.[0]?.delta?.content) {
                const chunk = parsed.choices[0].delta.content;
                fullResponse += chunk;
                outputTokens++;

                // Send chunk to client
                res.write(`event: chunk\ndata: ${JSON.stringify({
                  text: chunk,
                  tokens: outputTokens
                })}\n\n`);
              }
            } catch { /* skip invalid JSON */ }
          }
        }
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }

    // Send final stats
    res.write(`event: done\ndata: ${JSON.stringify({
      type: 'done',
      total_content: fullResponse,
      output_tokens: outputTokens,
      input_tokens: frames.length * 450,
      total_tokens: (frames.length * 450) + outputTokens,
      video: videoInfo
    })}\n\n`);

    // Cleanup temp files after a delay
    const frameDirs = [...new Set(frames.map(f => path.dirname(f)))];
    setTimeout(() => {
      for (const dir of frameDirs) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
      }
    }, 30000);

  } catch (err) {
    console.error('Stream error:', err.message);
    res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    // Try to end if not already
    if (!res.writableEnded) res.end();
  }
});

// ── Non-streaming route ─────────────────────────────────────
app.post('/api/chat', upload.array('files', 20), async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'At least one file is required' });
  }

  try {
    const images = req.files.filter(isImageFile);
    const videos = req.files.filter(isVideoFile);

    let frames = [];
    let videoInfo = null;

    for (const vid of videos) {
      const result = await extractFrames(vid.path, 1, 448, 70);
      videoInfo = {
        name: vid.originalname,
        duration: result.duration.toFixed(1) + 's',
        frames: result.count
      };
      frames.push(...result.files);
    }

    for (const img of images) {
      frames.push(img.path);
    }

    const llamaRes = await sendToLlama(frames, prompt, false);
    const result = await llamaRes.json();

    const usage = {
      frames: frames.length,
      output_tokens: result.usage?.completion_tokens || 0,
      total_tokens: result.usage?.total_tokens || 0,
      video: videoInfo
    };

    // Cleanup
    const frameDirs = [...new Set(frames.map(f => path.dirname(f)))];
    setTimeout(() => {
      for (const dir of frameDirs) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      }
    }, 30000);

    res.json({
      content: result.choices?.[0]?.message?.content || '',
      usage
    });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    llamaServer: LLAMA_SERVER,
    port: PORT,
    frames: process.env.FLAMES || 'ready'
  });
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🦙 UI-Lama running at http://localhost:${PORT}`);
  console.log(`📡 llama.cpp: ${LLAMA_SERVER}\n`);
});
