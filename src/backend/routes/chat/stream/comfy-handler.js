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