import path from "path";
import fs from "fs";
import { copyLocalFile, parseMcpResult } from "./file-handler.js";

/**
 * Extract file info from html2pdf convert_html_to_pdf result.
 */
export function extractHtml2PdfFileInfo(result) {
  console.log(`[Html2PdfHandler:extractHtml2PdfFileInfo] Called with result type: ${typeof result}`);
  
  // Parse the MCP result format first
  const parsed = parseMcpResult(result);
  
  if (!parsed) {
    console.log(`[Html2PdfHandler:extractHtml2PdfFileInfo] parseMcpResult returned null`);
    return null;
  }
  
  if (!parsed.outputPath) {
    console.log(`[Html2PdfHandler:extractHtml2PdfFileInfo] No outputPath found`);
    return null;
  }
  
  const fileName = path.basename(parsed.outputPath);
  const fileSizeStr = parsed.fileSize || "0 KB";
  const fileSizeKB = parseFloat(fileSizeStr) || 0;
  
  const fileInfo = {
    fileName,
    localPath: parsed.outputPath,
    fileSize: Math.round(fileSizeKB * 1024),
    mimeType: "application/pdf",
    isLocalFile: true,
  };
  
  console.log(`[Html2PdfHandler:extractHtml2PdfFileInfo] Extracted file info:`, fileInfo);
  return fileInfo;
}

/**
 * Process a local file (copy to downloads).
 */
export function processLocalFile(fileInfo, downloadsDir) {
  console.log(`[Html2PdfHandler:processLocalFile] Copying from: ${fileInfo.localPath}`);
  
  if (!fs.existsSync(fileInfo.localPath)) {
    throw new Error(`File not found: ${fileInfo.localPath}`);
  }
  
  const filePath = copyLocalFile(fileInfo.localPath, downloadsDir, fileInfo.fileName);
  const stats = fs.statSync(filePath);
  
  console.log(`[Html2PdfHandler:processLocalFile] Copied to: ${filePath}, size: ${stats.size}`);
  return { filePath, fileSize: stats.size };
}

/**
 * Modify the tool result for html2pdf files.
 */
export function modifyHtml2PdfToolResult(result, fileId, filePath, serverBaseUrl) {
  console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Called with:`, {
    fileId,
    filePath,
    serverBaseUrl,
  });
  
  // Start with a copy of the original result
  const modified = { ...result };
  
  // Add piFileId
  modified.piFileId = fileId;
  
  // Replace outputPath with our server URL
  const newUrl = `${serverBaseUrl}/api/chat/file/${fileId}`;
  
  if (modified.outputPath) {
    console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Replacing outputPath: ${modified.outputPath} -> ${newUrl}`);
    modified.downloadUrl = newUrl;
  }
  
  // Handle MCP format: content array with JSON string in text block
  if (Array.isArray(modified.content)) {
    console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Modifying result.content array`);
    modified.content = modified.content.map(block => {
      if (block.type === 'text' && block.text) {
        try {
          const parsed = JSON.parse(block.text);
          if (parsed.outputPath) {
            parsed.downloadUrl = newUrl;
          }
          return { ...block, text: JSON.stringify(parsed, null, 2) };
        } catch (e) {
          return block;
        }
      }
      return block;
    });
  }
  
  // Also modify details.mcpResult.content if present (UI display)
  if (modified.details?.mcpResult?.content) {
    console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Modifying details.mcpResult.content array`);
    modified.details.mcpResult.content = modified.details.mcpResult.content.map(block => {
      if (block.type === 'text' && block.text) {
        try {
          const parsed = JSON.parse(block.text);
          if (parsed.outputPath) {
            parsed.downloadUrl = newUrl;
          }
          return { ...block, text: JSON.stringify(parsed, null, 2) };
        } catch (e) {
          return block;
        }
      }
      return block;
    });
  }
  
  console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Modified result keys: ${Object.keys(modified)}`);
  return modified;
}
