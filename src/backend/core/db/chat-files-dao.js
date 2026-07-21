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

/**
 * Get all file paths for a session (for cleanup on deletion).
 */
export function getFilesBySession(sessionId) {
    return getDb().prepare("SELECT file_path FROM chat_files WHERE session_id = ?").all(sessionId);
}

/**
 * Get paginated files with session names, search, and type filter.
 */
export function getAllFilesPaginated({ page = 1, limit = 20, search, type }) {
    const db = getDb();
    const conditions = [];
    const params = [];

    if (search) {
        conditions.push("(f.file_name LIKE ? OR s.name LIKE ?)");
        const q = `%${search}%`;
        params.push(q, q);
    }
    if (type) {
        conditions.push("f.mime_type LIKE ?");
        params.push(`${type}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (page - 1) * limit;

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM chat_files f LEFT JOIN session_metadata s ON f.session_id = s.id ${where}`).get(...params);
    const total = countRow?.total || 0;

    const rows = db.prepare(`
        SELECT f.id, f.file_name, f.file_path, f.file_size, f.mime_type, f.type, f.tool_name, f.created_at,
               s.name as session_name, s.id as session_id
        FROM chat_files f
        LEFT JOIN session_metadata s ON f.session_id = s.id
        ${where}
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { files: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

