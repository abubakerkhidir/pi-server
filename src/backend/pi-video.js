import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

export function isImageFile(file) {
  const ext = file.originalname.split(".").pop().toLowerCase();
  const allowed = ["jpeg", "jpg", "png", "gif", "bmp", "webp"];
  return allowed.includes(ext) || file.mimetype.startsWith("image/");
}

export function isVideoFile(file) {
  const ext = file.originalname.split(".").pop().toLowerCase();
  const allowed = ["mp4", "mkv", "webm", "avi", "mov", "quicktime"];
  return allowed.includes(ext) || file.mimetype.startsWith("video/");
}

export function extractFrames(videoPath, fps = 1, maxWidth = 448, maxFrames = 70) {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "csv=p=0", videoPath,
    ], { timeout: 10000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        return reject(new Error("ffprobe failed"));
      }

      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        return reject(new Error("Invalid video duration"));
      }

      let total = Math.floor(duration * fps);
      if (total % 2 !== 0) total--;
      if (total < 2) total = 2;
      if (total > maxFrames) total = maxFrames;

      const actualFps = (total / duration).toFixed(4);
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-server-"));

      execFile("ffmpeg", [
        "-y", "-i", videoPath,
        "-vf", `fps=${actualFps},scale=${maxWidth}:-1`,
        "-q:v", "3",
        path.join(tmpDir, "frame_%04d.jpg"),
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
            files: frameFiles.map(f => path.join(tmpDir, f)),
          });
        });
      });
    });
  });
}

export function frameImagesToBase64(framePaths) {
  return framePaths.map(framePath => {
    const data = fs.readFileSync(framePath).toString("base64");
    return {
      type: "image",
      data,
      mimeType: "image/jpeg",
    };
  });
}

export function fileToImageContent(filePath, mimeType) {
  const data = fs.readFileSync(filePath).toString("base64");
  return {
    type: "image",
    data,
    mimeType: mimeType || "image/jpeg",
  };
}

export function cleanupFrameDirs(frameDirs) {
  for (const dir of frameDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { }
  }
}
