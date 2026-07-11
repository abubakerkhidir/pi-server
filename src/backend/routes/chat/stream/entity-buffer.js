import { getDb } from "../../../core/db.js";

/**
 * Calculate duration in milliseconds from start time.
 */
function calculateDuration(startedAt) {
  if (!startedAt) return null;
  return Date.now() - startedAt;
}

/**
 * Calculate content length for think or message entities.
 */
function calculateContentLength(entity) {
  if (entity.type === 'think' || entity.type === 'msg') {
    return (entity.content || '').length;
  }
  return null;
}

/**
 * Build the INSERT statement parameters for an entity.
 */
function buildEntityParams(entity, recordId, dbSessionId, seq) {
  return [
    recordId,
    dbSessionId,
    seq,
    entity.type,
    entity.type === 'think' || entity.type === 'msg' ? entity.content : null,
    entity.type === 'tool' ? entity.toolName : null,
    entity.type === 'tool' ? JSON.stringify(entity.toolArgs ?? {}) : null,
    entity.type === 'tool' ? JSON.stringify(entity.result ?? null) : null,
    entity.type === 'tool' ? (entity.isError ? 1 : 0) : 0,
    entity.type === 'tool' ? (entity.isComplete ? 1 : 0) : 0,
    calculateDuration(entity.startedAt),
    calculateContentLength(entity),
  ];
}

/**
 * Create an entity buffer for tracking and persisting chat entities.
 * @param {string} recordId - The chat record ID
 * @param {string} dbSessionId - The session ID
 * @returns {Object} Entity buffer functions
 */
export function createEntityBuffer(recordId, dbSessionId) {
  const db = getDb();
  let entityBuf = [];
  let entitySeq = 0;

  const INSERT_STMT = `
    INSERT INTO chat_entities (record_id, session_id, seq, type, content,
                               tool_name, tool_args, tool_result,
                               tool_is_error, is_complete,
                               duration_ms, content_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  function lastEntity(type) {
    return [...entityBuf].reverse().find((e) => e.type === type && !e.saved);
  }

  function saveEntity(entity) {
    if (entity.saved) return;

    const params = buildEntityParams(entity, recordId, dbSessionId, entitySeq++);
    const result = db.prepare(INSERT_STMT).run(...params);
    entity.saved = true;
    entity.dbEntityId = Number(result.lastInsertRowid);
    return entity.dbEntityId;
  }

  function sealAndSave(type) {
    const ent = lastEntity(type);
    if (ent && !ent.saved) {
      ent.sealed = true;
      saveEntity(ent);
    }
  }

  function flushAll() {
    for (const ent of entityBuf) {
      if (!ent.saved) saveEntity(ent);
    }
  }

  function addEntity(entity) {
    entityBuf.push(entity);
  }

  function findToolEntity(toolId) {
    return entityBuf.find(
      (e) => e.type === 'tool' && e.toolId === toolId && !e.saved
    );
  }

  return {
    lastEntity,
    saveEntity,
    sealAndSave,
    flushAll,
    addEntity,
    findToolEntity,
  };
}
