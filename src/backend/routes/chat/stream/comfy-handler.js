import { downloadFile, saveBufferToFile, parseMcpResult, modifyContentBlocks } from "./file-handler.js";
import { getDb } from "../../../core/db.js";
  
/**
 * Extract file info from Comfy MCP generate_image result.
 */
export function extractComfyFileInfo(result) {
  console.log(`[ComfyHandler:extractComfyFileInfo] Called with result type: ${typeof result}`);
  
  // Parse the MCP result format first
  const parsed = parseMcpResult(result);
  
  if (!parsed) {
    console.log(`[ComfyHandler:extractComfyFileInfo] parseMcpResult returned null`);
    return null;
  }
  
  console.log(`[ComfyHandler:extractComfyFileInfo] Parsed result keys: ${Object.keys(parsed)}`);
  
  if (!parsed.asset_url) {
    console.log(`[ComfyHandler:extractComfyFileInfo] No asset_url found in parsed result`);
    return null;
  }
  
  const fileInfo = {
    fileName: parsed.filename || `image_${Date.now()}.png`,
    fileUrl: parsed.asset_url,
    fileSize: parsed.bytes_size || 0,
    mimeType: parsed.mime_type || "image/png",
    assetId: parsed.asset_id,
    isComfyAsset: true,
    width: parsed.width,
    height: parsed.height,
  };
  
  console.log(`[ComfyHandler:extractComfyFileInfo] Extracted file info:`, fileInfo);
  return fileInfo;
}

/**
 * Process a Comfy asset (download from URL).
 */
export async function processComfyAsset(fileInfo, downloadsDir) {
  console.log(`[ComfyHandler:processComfyAsset] Downloading from: ${fileInfo.fileUrl}`);
  const buffer = await downloadFile(fileInfo.fileUrl);
  const filePath = saveBufferToFile(buffer, downloadsDir, fileInfo.fileName);
  return { filePath, fileSize: buffer.length };
}

/**
 * Modify the tool result for Comfy assets.
 * Replaces asset_url/image_url with server URLs and removes inline preview.
 */
export function modifyComfyToolResult(result, fileId, filePath, serverBaseUrl, fileInfo) {
  console.log(`[ComfyHandler:modifyComfyToolResult] Called with:`, {
    fileId,
    filePath,
    serverBaseUrl,
  });
  
  // Start with a copy of the original result
  const modified = { ...result };
  
  // Add piFileId
  modified.piFileId = fileId;
  
  // Replace filePath with local path
  modified.filePath = filePath;
  
  // Add width and height from fileInfo if present
  if (fileInfo?.width) modified.width = fileInfo.width;
  if (fileInfo?.height) modified.height = fileInfo.height;
  
  const newUrl = `${serverBaseUrl}/api/chat/file/${fileId}`;
  
  // Handle direct result format (asset_url at top level)
  if (modified.asset_url) {
    console.log(`[ComfyHandler:modifyComfyToolResult] Replacing top-level asset_url: ${modified.asset_url} -> ${newUrl}`);
    modified.asset_url = newUrl;
  }
  if (modified.image_url) {
    console.log(`[ComfyHandler:modifyComfyToolResult] Replacing top-level image_url: ${modified.image_url} -> ${newUrl}`);
    modified.image_url = newUrl;
  }
  
  // Handle MCP format: content array with JSON string in text block
  if (Array.isArray(modified.content)) {
    console.log(`[ComfyHandler:modifyComfyToolResult] Modifying result.content array`);
    modified.content = modifyContentBlocks(modified.content, newUrl);
  }
  
  // Also modify details.mcpResult.content if present (UI display)
  if (modified.details?.mcpResult?.content) {
    console.log(`[ComfyHandler:modifyComfyToolResult] Modifying details.mcpResult.content array`);
    modified.details.mcpResult.content = modifyContentBlocks(modified.details.mcpResult.content, newUrl);
  }
  
  console.log(`[ComfyHandler:modifyComfyToolResult] Modified result keys: ${Object.keys(modified)}`);
  return modified;
}

/**
 * Check if an asset_id exists in the database for a given user.
 * @param {string} assetId - The Comfy asset ID
 * @param {number} userId - The user ID
 * @returns {Object|null} The file record if found, null otherwise
 */
export function findFileByAssetId(assetId, userId) {
  const db = getDb();
  
  console.log(`[ComfyHandler:findFileByAssetId] Looking for assetId: ${assetId}, userId: ${userId}`);
  
  const record = db.prepare(`
    SELECT id, file_name, file_path, file_size, mime_type 
    FROM chat_files 
    WHERE tool_name LIKE '%generate_image%' 
    AND file_name LIKE ?
    AND record_id IN (
      SELECT id FROM chat_records WHERE user_id = ?
    )
    LIMIT 1
  `).get(`%${assetId}%`, userId);
  
  // Also try matching by asset_id in file_name pattern
  if (!record) {
    // The asset_id might be in the filename or we need to search differently
    // Let's search for any recent generate_image files for this user
    const recentRecord = db.prepare(`
      SELECT id, file_name, file_path, file_size, mime_type, tool_name
      FROM chat_files 
      WHERE tool_name LIKE '%generate_image%'
      AND record_id IN (
        SELECT id FROM chat_records WHERE user_id = ?
      )
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId);
    
    if (recentRecord) {
      console.log(`[ComfyHandler:findFileByAssetId] Found recent generate_image record:`, recentRecord);
      return recentRecord;
    }
  }
  
  console.log(`[ComfyHandler:findFileByAssetId] Found record:`, record);
  return record;
}

/**
 * Check if a view_image tool call should be intercepted.
 * If the asset was already saved locally, reject and tell LLM to use ctx_read.
 * @param {string} toolName - The tool name
 * @param {Object} args - Tool arguments
 * @param {number} userId - The user ID
 * @returns {Object|null} Rejection result if should intercept, null otherwise
 */
export function interceptViewImage(toolName, args, userId) {
  // Check if this is a view_image tool
  if (!toolName?.includes('view_image')) {
    return null;
  }
  
  console.log(`[ComfyHandler:interceptViewImage] Intercepting view_image call`);
  console.log(`[ComfyHandler:interceptViewImage] Args:`, args);
  
  // Check if we have an asset_id in args
  const assetId = args?.asset_id;
  if (!assetId) {
    console.log(`[ComfyHandler:interceptViewImage] No asset_id in args, letting through`);
    return null;
  }
  
  // Search for this asset in our database
  const fileRecord = findFileByAssetId(assetId, userId);
  
  if (fileRecord) {
    console.log(`[ComfyHandler:interceptViewImage] Found local file, creating rejection`);
    const text = `The image has already been saved locally. To view it, use the ctx_read tool with this file path:\n\n${fileRecord.file_path}\n\nThe file is ${fileRecord.file_size} bytes (${fileRecord.mime_type}).`;
    return {content: [{type: "text",text}], isError: false};
  }
  
  console.log(`[ComfyHandler:interceptViewImage] Asset not found locally, letting through`);
  return null;
}
