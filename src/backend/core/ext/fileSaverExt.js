import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db.js";
import { getEntityBuffer } from "../../routes/chat/stream/state.js";
import { Html2PdfFileSaver } from "./fileSaver/html2pdf-handler.js";
import { ComfyFileSaver } from "./fileSaver/comfy-handler.js";

const handlers = []
export function registerHandler(h){
    handlers.push(h)
}

export async function handleFileSaveEvent(pi, event, ctx) {
    try{
        const sessionId = ctx?.sessionManager?.sessionId
        const entityBuffer = getEntityBuffer(sessionId);
        if(!entityBuffer || !event.toolCallId){
            console.log('>>>>>>>>>>>>>>>>>>> entityBuffer is null...',sessionId, entityBuffer,event.toolCallId)
            return
        }
        const tool = entityBuffer?.findToolEntity(event.toolCallId);
        let toolName = event.toolName
        if (toolName === 'mcp' && tool?.toolArgs?.tool) {
            toolName = tool.toolArgs.tool;
            console.log('parsed mcp args, tool:', toolName)
        }
        initHandlers()
        console.log('normalizing-tool: ',toolName, handlers.length)
        toolName = normalizeToolName(toolName)
        console.log('done normalizing-tool: ',toolName)
        const fileInfo = extractFileInfo(toolName, event);
        console.log('normalized-tool: ',toolName, handlers.length, tool, fileInfo)
        if(fileInfo && tool){
            const entityId = tool?.dbEntityId || null;
            console.log(`[handleFileSaveEvent] Entity ID: ${entityId}`);
            return await autoSaveGeneratedFile(entityBuffer,tool,fileInfo, toolName, event, entityBuffer.recordId, sessionId, entityBuffer.userId, entityId );
        }else{
            console.log('not file-saver tool... ',toolName,tool)
        }
    }catch(err){
        console.log('error handle save-file: ',err)
    }
    return null
}

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

//Copy a local file to the user's downloads directory.
export function copyLocalFile(sourcePath, downloadsDir, fileName) {
    const destPath = path.join(downloadsDir, fileName);
    fs.copyFileSync(sourcePath, destPath);
    return destPath;
}

// Save a file buffer to the user's downloads directory.
export async function saveBufferToFile(buffer, downloadsDir, fileName) {
    const filePath = path.join(downloadsDir, fileName);
    fs.writeFileSync(filePath, buffer);
    console.log(`[FileHandler:saveBufferToFile] Saved buffer to: ${filePath}`);
    return filePath;
}

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

async function autoSaveGeneratedFile(entityBuffer,tool, fileInfo, toolName, result, recordId, sessionId, userId, entityId) {
    try {
        const downloadsDir = getUserDownloadsDir(userId);
        const serverBaseUrl = getServerBaseUrl();
        const {filePath,fileSize} = await processToolResult(fileInfo,downloadsDir)
        const fileId = uuidv4();
        const newUrl = `${serverBaseUrl}/api/chat/file/${fileId}`;
        const modified = modifyToolResult(newUrl, result, fileId, filePath, fileInfo)
        saveToolToBuffer(tool,modified,false,entityBuffer)
        saveFileRecord(fileId, recordId, sessionId,{ ...fileInfo, fileSize },toolName,entityId,filePath,fileInfo.assetId);
        return modified
    } catch (err) {
        console.error(`[FileHandler:autoSaveGeneratedFile] Failed to save file:`, err.message);
        return null;
    }
}

function normalizeToolName(toolName) {
    for (const handler of handlers) {
        for (const known of handler.getToolNames()) {
            if (toolName?.endsWith(known)) {
                return known;
            }
        }
    }
    return toolName;
}

function extractFileInfo(toolName, result) {
    for (const handler of handlers) {
        const info = handler.extractFileInfo(toolName, result);
        if (info) {
            return info;
        }
    }
    return null
}

async function processToolResult(fileInfo, downloadsDir) {
    for (const handler of handlers) {
        const info = await handler.processToolResult(fileInfo, downloadsDir);
        if (info) {
            return info;
        }
    }
    return null
}

function modifyToolResult(newUrl, result, fileId, filePath, fileInfo) {
    for (const handler of handlers) {
        const info = handler.modifyToolResult(newUrl, result, fileId, filePath, fileInfo)
        if (info) {
            return info;
        }
    }
    return null
}

function getUserDownloadsDir(userId) {
    const db = getDb();
    const user = db.prepare("SELECT home_dir, username FROM users WHERE id = ?").get(userId);
    const userDir = user?.home_dir || path.join(process.cwd(), "users", user?.username || "default");
    const downloadsDir = path.join(userDir, "downloads");
    fs.mkdirSync(downloadsDir, { recursive: true });
    return downloadsDir;
}

// Get the server base URL from request or environment.
function getServerBaseUrl() {
    const fullUrl = process.env.FULL_URL
    if (fullUrl) {
        return fullUrl;
    }
    const port = process.env.PORT || 3500;
    return `http://localhost:${port}`;
}

// Save file record to database.
function saveFileRecord(fileId, recordId, sessionId, fileInfo, toolName, entityId, filePath, assetId = null) {
    const db = getDb();
    console.log(`[FileHandler:saveFileRecord] Saving to DB:`, { recordId, sessionId, fileId, fileName: fileInfo.fileName, filePath, fileSize: fileInfo.fileSize, assetId });
    db.prepare(`
        INSERT INTO chat_files (id, record_id, session_id, type, file_name, file_path, file_size, mime_type, tool_name, chat_entity_id, asset_id)
        VALUES (?, ?, ?, 'download', ?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, recordId, sessionId, fileInfo.fileName, filePath, fileInfo.fileSize, fileInfo.mimeType, toolName, entityId, assetId ?? '');
    return fileId;
}

function saveToolToBuffer(tool, reslt, err, entityBuffer) {
    if (tool) {
        tool.result = reslt;
        tool.isError = err;
        tool.isComplete = true;
        entityBuffer.saveEntity(tool);
    }
}

function initHandlers(){
    if(!handlers.length){
        registerHandler(new Html2PdfFileSaver())
        registerHandler(new ComfyFileSaver())
    }
}