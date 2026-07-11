import {
  isImageFile,
  isVideoFile,
  extractFrames,
  frameImagesToBase64,
  fileToImageContent,
} from "../../../core/pi-video.js";

/**
 * Process a video file and extract frames.
 */
async function processVideoFile(videoFile) {
  const result = await extractFrames(videoFile.path, 1, 448, 70);
  const videoInfo = {
    name: videoFile.originalname,
    duration: result.duration.toFixed(1) + "s",
    frames: result.count,
  };
  const images = frameImagesToBase64(result.files);
  return { images, videoInfo, tempDir: result.dir };
}

/**
 * Process an image file.
 */
function processImageFile(imageFile) {
  return fileToImageContent(imageFile.path, imageFile.mimetype);
}

/**
 * Process uploaded files and return images and video info.
 * @param {Array} files - Uploaded files from multer
 * @returns {Promise<{images: Array, videoInfo: Object|null, tempDirs: Array}>}
 */
export async function processUploadedFiles(files) {
  if (!files || files.length === 0) {
    return { images: [], videoInfo: null, tempDirs: [] };
  }

  const images = [];
  const tempDirs = [];
  let videoInfo = null;

  const videoFiles = files.filter(isVideoFile);
  const imageFiles = files.filter(isImageFile);

  for (const vid of videoFiles) {
    const result = await processVideoFile(vid);
    tempDirs.push(result.tempDir);
    videoInfo = result.videoInfo;
    images.push(...result.images);
  }

  for (const img of imageFiles) {
    images.push(processImageFile(img));
  }

  return { images, videoInfo, tempDirs };
}
