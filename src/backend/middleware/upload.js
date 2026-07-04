import multer from "multer";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
});

export default upload;
export { UPLOAD_DIR };
