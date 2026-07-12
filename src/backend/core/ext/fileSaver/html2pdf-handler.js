import path from "path";
import fs from "fs";
import { registerHandler, parseMcpResult, copyLocalFile } from "../fileSaverExt.js";

const tools = ["convert_html_to_pdf", "html_to_pdf"];
export class Html2PdfFileSaver {
  getToolNames() {
    return tools
  }

  extractFileInfo(toolName, result) {
    if (toolName && tools.includes(toolName)) {
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
      const fileInfo = { fileName, localPath: parsed.outputPath, fileSize: Math.round(fileSizeKB * 1024), mimeType: "application/pdf", isLocalFile: true };
      console.log(`[Html2PdfHandler:extractHtml2PdfFileInfo] Extracted file info:`, fileInfo);
      return fileInfo;
    }
    return null
  }

  processToolResult(fileInfo, downloadsDir) {
    if (fileInfo.isLocalFile) {
      console.log(`[Html2PdfHandler:processLocalFile] Copying from: ${fileInfo.localPath}`);
      if (!fs.existsSync(fileInfo.localPath)) {
        throw new Error(`File not found: ${fileInfo.localPath}`);
      }
      const filePath = copyLocalFile(fileInfo.localPath, downloadsDir, fileInfo.fileName);
      const stats = fs.statSync(filePath);
      console.log(`[Html2PdfHandler:processLocalFile] Copied to: ${filePath}, size: ${stats.size}`);
      return { filePath, fileSize: stats.size };
    }
    return undefined
  }

  modifyToolResult(newUrl, result, fileId, filePath, fileInfo) {
    if (fileInfo.isLocalFile) {
      console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Called with:`, { fileId, filePath, serverBaseUrl, });
      // Start with a copy of the original result
      const modified = { ...result };
      modified.piFileId = fileId;
      if (modified.outputPath) {
        console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Replacing outputPath: ${modified.outputPath} -> ${newUrl}`);
        modified.downloadUrl = newUrl;
        modified.outputPath = filePath
      }
      // Handle MCP format: content array with JSON string in text block
      if (Array.isArray(modified.content)) {
        console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Modifying result.content array`);
        modified.content = modifyContentBlock(modified.content, newUrl, filePath);
      }
      // Also modify details.mcpResult.content if present (UI display)
      if (modified.details?.mcpResult?.content) {
        console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Modifying details.mcpResult.content array`);
        modified.details.mcpResult.content = modifyContentBlock(modified.details.mcpResult.content, newUrl, filePath);
      }
      console.log(`[Html2PdfHandler:modifyHtml2PdfToolResult] Modified result keys: ${Object.keys(modified)}`);
      return modified;
    }
    return undefined
  }

}

function modifyContentBlock(cnt, newUrl, filePath) {
  return cnt.map(block => {
    if (block.type === 'text' && block.text) {
      try {
        const parsed = JSON.parse(block.text);
        if (parsed.outputPath) {
          parsed.downloadUrl = newUrl;
          parsed.outputPath = filePath;
        }
        return { ...block, text: JSON.stringify(parsed, null, 2) };
      } catch (e) {
        return block;
      }
    }
    return block;
  });
}



