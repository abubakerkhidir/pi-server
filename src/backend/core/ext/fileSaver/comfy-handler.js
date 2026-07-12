import { downloadFile, saveBufferToFile, parseMcpResult, registerHandler } from "../fileSaverExt.js";
import { getDb } from "../../../core/db.js";

const comfyTools = ["generate_image", "generate_song", "generate_video", "generate_audio"];

export class ComfyFileSaver {
  getToolNames() {
    return comfyTools
  }

  extractFileInfo(toolName, result) {
    if (toolName && comfyTools.includes(toolName)) {
      const parsed = parseMcpResult(result);
      if (!parsed) {
        return null;
      }
      console.log(`[extractComfyFileInfo] Parsed result keys: ${Object.keys(parsed)}`);
      if (!parsed.asset_url) {
        console.log(`[extractComfyFileInfo] No asset_url found in parsed result`);
        return null;
      }
      const fileInfo = {
        fileName: parsed.filename || `image_${Date.now()}.png`, fileUrl: parsed.asset_url, fileSize: parsed.bytes_size || 0,
        mimeType: parsed.mime_type || "image/png", assetId: parsed.asset_id, isComfyAsset: true, width: parsed.width, height: parsed.height,
      };
      console.log(`[extractComfyFileInfo] Extracted file info:`, fileInfo);
      return fileInfo;
    }
    return null
  }

  async processToolResult(fileInfo, downloadsDir) {
    if (fileInfo?.isComfyAsset) {
      console.log(`[processComfyAsset] Downloading from: ${fileInfo.fileUrl}`);
      const buffer = await downloadFile(fileInfo.fileUrl);
      const filePath = saveBufferToFile(buffer, downloadsDir, fileInfo.fileName);
      return { filePath, fileSize: buffer.length };
    }
    return undefined
  }

  /**
   * Modify the tool result for Comfy assets.
   * Replaces asset_url/image_url with server URLs and removes inline preview.
   */
  modifyToolResult(newUrl, result, fileId, filePath, fileInfo) {
    if (fileInfo?.isComfyAsset) {
      console.log(`[modifyToolResult] Called with:`, { fileId, filePath, });

      // Start with a copy of the original result
      const modified = { ...result };
      modified.piFileId = fileId; // Add piFileId
      modified.filePath = filePath;   // Replace filePath with local path
      if (fileInfo?.width) modified.width = fileInfo.width;   // Add width and height from fileInfo if present
      if (fileInfo?.height) modified.height = fileInfo.height;

      // Handle direct result format (asset_url at top level)
      if (modified.asset_url) {
        console.log(`[modifyComfyToolResult] Replacing top-level asset_url: ${modified.asset_url} -> ${newUrl}`);
        modified.asset_url = newUrl;
      }
      if (modified.image_url) {
        console.log(`[modifyComfyToolResult] Replacing top-level image_url: ${modified.image_url} -> ${newUrl}`);
        modified.image_url = newUrl;
      }

      // Handle MCP format: content array with JSON string in text block
      if (Array.isArray(modified.content)) {
        console.log(`[modifyComfyToolResult] Modifying result.content array`);
        modified.content = modifyContentBlocks(modified.content, newUrl);
      }

      // Also modify details.mcpResult.content if present (UI display)
      if (modified.details?.mcpResult?.content) {
        console.log(`[modifyComfyToolResult] Modifying details.mcpResult.content array`);
        modified.details.mcpResult.content = modifyContentBlocks(modified.details.mcpResult.content, newUrl);
      }

      console.log(`[modifyComfyToolResult] Modified result keys: ${Object.keys(modified)}`);
      return modified;
    }
    return undefined
  }
}

function modifyContentBlocks(content, newUrl) {
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

registerHandler(new ComfyFileSaver())
