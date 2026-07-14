import { getDb } from "./db.js";
import { v4 as uuidv4 } from "uuid";

export function getChatFilesByRec(recId) {
  return getDb().prepare("SELECT * FROM chat_files WHERE record_id = ? ORDER BY created_at ASC").all(recId);
}

export function getFileById(fileId) {
  return getDb().prepare(`SELECT f.* FROM chat_files f WHERE f.id = ?`).get(fileId);
}

export function saveFileMetadata(recordId, dbSessionId, files) {
  if (!files || files.length === 0) return;
  const db = getDb();
  const fileInsert = db.prepare("INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, 'upload', ?, ?, ?, ?)");
  for (const f of files) {
    fileInsert.run(uuidv4(),recordId,dbSessionId,f.originalname,f.path,f.size,f.mimetype || "application/octet-stream");
  }
}
export function insertFile(fileId, recordId, sessionId, fileType, fileName, filePath, fileSize, mimeType, toolName, entityId, assetIdS) {
    const db = getDb();
    db.prepare(`INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type, tool_name, chat_entity_id, asset_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(fileId, recordId, sessionId, fileType, fileName, filePath, fileSize, mimeType, toolName, entityId, assetIdS);
}export function findFileByAssetId(assetId) {
    const db = getDb();
    const record = db.prepare(`SELECT id, file_name, file_path, file_size, mime_type FROM chat_files  WHERE asset_id = ? LIMIT 1`).get(assetId);
    return record;
}

