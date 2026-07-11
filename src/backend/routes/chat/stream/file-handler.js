import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../../../core/db.js";
import { extractComfyFileInfo, processComfyAsset, modifyComfyToolResult, interceptViewImage } from "./comfy-handler.js";
import { extractHtml2PdfFileInfo, processLocalFile, modifyHtml2PdfToolResult } from "./html2pdf-handler.js";

// Re-export interceptViewImage for use in handler.js
export { interceptViewImage };

/**
 * Get the user's downloads directory.
 */
export function getUserDownloadsDir(userId) {
  const db = getDb();
  const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
  const userDir = user?.home_dir || path.join(process.cwd(), "users", user?.username || "default");
  const downloadsDir = path.join(userDir, "downloads");
  fs.mkdirSync(downloadsDir, { recursive: true });
  return downloadsDir;
}

/**
 * Download a file from a URL.
 */
export function downloadFile(url) {
  console.log(`[FileHandler:downloadFile] Starting download from: ${url}`);
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      console.log(`[FileHandler:downloadFile] Response status: ${res.statusCode}`);
      if (res.statusCode === 301 || res.statusCode === 302) {
        console.log(`[FileHandler:downloadFile] Following redirect to: ${res.headers.location}`);
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        console.error(`[FileHandler:downloadFile] HTTP error: ${res.statusCode}`);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        console.log(`[FileHandler:downloadFile] Download complete, size: ${buffer.length} bytes`);
        resolve(buffer);
      });
      res.on("error", reject);
    }).on("error", (err) => {
      console.error(`[FileHandler:downloadFile] Network error:`, err.message);
      reject(err);
    });
  });
}

/**
 * Copy a local file to the user's downloads directory.
 */
export function copyLocalFile(sourcePath, downloadsDir, fileName) {
  const destPath = path.join(downloadsDir, fileName);
  fs.copyFileSync(sourcePath, destPath);
  return destPath;
}

/**
 * Save a file buffer to the user's downloads directory.
 */
export function saveBufferToFile(buffer, downloadsDir, fileName) {
  const filePath = path.join(downloadsDir, fileName);
  fs.writeFileSync(filePath, buffer);
  console.log(`[FileHandler:saveBufferToFile] Saved buffer to: ${filePath}`);
  return filePath;
}

/**
 * Get the server base URL from request or environment.
 */
export function getServerBaseUrl(req) {
  if (req) {
    const protocol = req.protocol || "http";
    const host = req.get("host") || "localhost:3500";
    return `${protocol}://${host}`;
  }
  const port = process.env.PORT || 3500;
  return `http://localhost:${port}`;
}

/**
 * Save file record to database.
 */
export function saveFileRecord(recordId, sessionId, fileInfo, toolName, entityId, filePath, assetId = null) {
  const db = getDb();
  const fileId = uuidv4();
  
  console.log(`[FileHandler:saveFileRecord] Saving to DB:`, {
    recordId,
    sessionId,
    fileId,
    fileName: fileInfo.fileName,
    filePath,
    fileSize: fileInfo.fileSize,
    mimeType: fileInfo.mimeType,
    toolName,
    entityId,
    assetId,
  });
  
  // Insert with asset_id if available
  if (assetId) {
    db.prepare(`
      INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type, tool_name, chat_entity_id, asset_id)
      VALUES (?, ?, ?, 'download', ?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, recordId, sessionId, fileInfo.fileName, filePath, fileInfo.fileSize, fileInfo.mimeType, toolName, entityId, assetId);
  } else {
    db.prepare(`
      INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type, tool_name, chat_entity_id)
      VALUES (?, ?, ?, 'download', ?, ?, ?, ?, ?, ?)
    `).run(fileId, recordId, sessionId, fileInfo.fileName, filePath, fileInfo.fileSize, fileInfo.mimeType, toolName, entityId);
  }
  
  console.log(`[FileHandler:saveFileRecord] Saved with fileId: ${fileId}`);
  return fileId;
}

/**
 * Parse the result to extract the actual data.
 * MCP results have structure: { content: [{ type: "text", text: "{json}" }] }
 * We need to parse the JSON from the text content.
 */
export function parseMcpResult(result) {
  if (!result) {
    return null;
  }
  
  // If result already has asset_url directly, return it
  if (result.asset_url) {
    return result;
  }
  
  // If result has content array (MCP format), extract and parse the text
  if (Array.isArray(result.content) && result.content.length > 0) {
    const textBlock = result.content.find(block => block.type === "text");
    if (textBlock && textBlock.text) {
      try {
        const parsed = JSON.parse(textBlock.text);
        return parsed;
      } catch (e) {
        // Not valid JSON, might be an error message
        return null;
      }
    }
  }
  
  return null;
}

/**
 * Modify content array blocks by replacing URLs and removing preview data.
 * Reusable for both result.content and result.details.mcpResult.content.
 */
export function modifyContentBlocks(content, newUrl) {
  if (!Array.isArray(content)) return content;
  
  return content.map(block => {
    if (block.type === 'text' && block.text) {
      try {
        const parsed = JSON.parse(block.text);
        
        // Replace asset_url if present
        if (parsed.asset_url) {
          parsed.asset_url = newUrl;
        }
        
        // Replace image_url if present
        if (parsed.image_url) {
          parsed.image_url = newUrl;
        }
        
        // Remove inline_preview_base64 to save tokens (user will see the actual image)
        delete parsed.inline_preview_base64;
        delete parsed.inline_preview_mime_type;
        
        // Stringify back
        return { ...block, text: JSON.stringify(parsed, null, 2) };
      } catch (e) {
        return block;
      }
    }
    return block;
  });
}

/**
 * Normalize tool name by stripping server prefix (e.g., "comfy1_generate_image" -> "generate_image")
 */
export function normalizeToolName(toolName) {
  // Known tool names that we handle
  const knownTools = [
    "generate_image",
    "generate_song",
    "generate_video",
    "convert_html_to_pdf",
    "text_to_speech",
    "generate_audio",
    "view_image",
  ];
  
  // Check if tool name ends with any known tool name
  for (const known of knownTools) {
    if (toolName.endsWith(known)) {
      return known;
    }
  }
  
  // Fallback: if tool name contains underscore, try stripping first part
  if (toolName.includes("_")) {
    const parts = toolName.split("_");
    // Only strip if first part looks like a server prefix (short, contains numbers)
    if (parts.length >= 3 && parts[0].length <= 15 && /\d/.test(parts[0])) {
      return parts.slice(1).join("_");
    }
  }
  
  return toolName;
}

/**
 * Extract file info based on tool name.
 */
function extractFileInfo(toolName, result) {
  console.log(`[FileHandler:extractFileInfo] Called with toolName: ${toolName}`);
  
  const normalizedName = normalizeToolName(toolName);
  console.log(`[FileHandler:extractFileInfo] Normalized tool name: ${normalizedName}`);
  
  switch (normalizedName) {
    case "generate_image":
    case "generate_song":
      console.log(`[FileHandler:extractFileInfo] Extracting Comfy file info`);
      return extractComfyFileInfo(result);
    case "convert_html_to_pdf":
      console.log(`[FileHandler:extractFileInfo] Extracting html2pdf file info`);
      return extractHtml2PdfFileInfo(result);
    default:
      // Fallback: check result for file-related attributes
      const parsed = parseMcpResult(result);
      if (parsed?.asset_url || parsed?.image_url) {
        return extractComfyFileInfo(result);
      }
      if (parsed?.outputPath) {
        return extractHtml2PdfFileInfo(result);
      }
      return null;
  }
}

/**
 * Auto-save a generated file from tool execution.
 */
export async function autoSaveGeneratedFile({ toolName, result, args, recordId, sessionId, userId, entityId, req }) {
  console.log(`[FileHandler:autoSaveGeneratedFile] toolName: ${toolName}`);
  
  // Extract file info based on tool
  const fileInfo = extractFileInfo(toolName, result);
  if (!fileInfo) {
    console.log(`[FileHandler:autoSaveGeneratedFile] No file info found, exiting`);
    return null;
  }
  
  console.log(`[FileHandler:autoSaveGeneratedFile] Extracted fileInfo:`, fileInfo);
  
  try {
    const downloadsDir = getUserDownloadsDir(userId);
    const serverBaseUrl = getServerBaseUrl(req);
    
    let filePath;
    let fileSize;
    
    // Process based on file source
    if (fileInfo.isComfyAsset) {
      const processed = await processComfyAsset(fileInfo, downloadsDir);
      filePath = processed.filePath;
      fileSize = processed.fileSize;
    } else if (fileInfo.isLocalFile) {
      const processed = processLocalFile(fileInfo, downloadsDir);
      filePath = processed.filePath;
      fileSize = processed.fileSize;
    } else {
      return null;
    }
    
    // Save to database with asset_id for Comfy files
    const assetId = fileInfo.assetId || null;
    const fileId = saveFileRecord(
      recordId,
      sessionId,
      { ...fileInfo, fileSize },
      toolName,
      entityId,
      filePath,
      assetId
    );
    
    // Modify result based on tool type
    let modifiedResult;
    if (fileInfo.isComfyAsset) {
      modifiedResult = modifyComfyToolResult(result, fileId, filePath, serverBaseUrl, fileInfo);
    } else {
      modifiedResult = modifyHtml2PdfToolResult(result, fileId, filePath, serverBaseUrl);
    }
    
    console.log(`[FileHandler:autoSaveGeneratedFile] Saved file: ${fileInfo.fileName} -> ${fileId}`);
    
    return {
      fileId,
      filePath,
      fileName: fileInfo.fileName,
      fileSize,
      mimeType: fileInfo.mimeType,
      modifiedResult,
    };
  } catch (err) {
    console.error(`[FileHandler:autoSaveGeneratedFile] Failed to save file:`, err.message);
    return null;
  }
}

/**
 * Check if a tool generates files that should be saved.
 */
export function isFileGeneratingTool(toolName, result = null) {
  console.log(`[FileHandler:isFileGeneratingTool] Checking toolName: ${toolName}`);
  
  const normalizedName = normalizeToolName(toolName);
  
  const FILE_GENERATING_TOOLS = [
    "generate_image",
    "generate_song",
    "generate_video",
    "convert_html_to_pdf",
    "text_to_speech",
    "generate_audio",
  ];
  
  // Check normalized tool name
  if (FILE_GENERATING_TOOLS.includes(normalizedName)) {
    console.log(`[FileHandler:isFileGeneratingTool] Match by normalized name: true`);
    return true;
  }
  
  // Check original tool name (in case normalization failed)
  if (FILE_GENERATING_TOOLS.some(t => toolName.includes(t))) {
    console.log(`[FileHandler:isFileGeneratingTool] Match by substring: true`);
    return true;
  }
  
  // Fallback: check result for file-related attributes
  if (result) {
    const parsed = parseMcpResult(result);
    const hasAssetUrl = parsed?.asset_url || parsed?.image_url || parsed?.outputPath;
    const hasFileAttributes = parsed?.filename && parsed?.mime_type;
    
    if (hasAssetUrl || hasFileAttributes) {
      console.log(`[FileHandler:isFileGeneratingTool] Match by attribute detection: true`);
      return true;
    }
  }
  
  return false;
}
