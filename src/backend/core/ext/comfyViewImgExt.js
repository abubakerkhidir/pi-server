import { findFileByAssetId } from '../db/chat-files-dao.js';
import { buildFileUrl } from './fileSaverExt.js';

export async function comfyViewImgExt(pi,event, ctx){
    // Target your specific tool (e.g., bash)
    if (event.toolName === "mcp" && event.input?.tool?.includes('view_image') && event.input.args) {
        console.log('***** on mcp tool call for comfyViewImgExt: ', JSON.stringify(event))
        const args = JSON.parse(event.input.args)
        const assetId = args?.asset_id;
        if (!assetId) {
            console.log(`[comfyViewImgExt] No asset_id in args, letting through`);
            return null;
        }
        // Search for this asset in our database
        const f = findFileByAssetId(assetId);
        if (f) {
            const url = buildFileUrl(f.id)
            // const text = `The image has already been saved locally. To view it, use the ctx_read tool with this file path:\n\n${fileRecord.file_path}\n\n
            //     The file is ${fileRecord.file_size} bytes (${fileRecord.mime_type}).`;
            const text = `The image has already been saved locally. user can view it by clicking on this url: [${url}]. You don't need to read it unless user explicitly 
                ask you to review it, in such case use the ctx_read/read tool with this file path: [${f.file_path}], The file is ${f.file_size} bytes (${f.mime_type}).`;
            console.log(`[comfyViewImgExt] Found local file, creating rejection: `,text);
            //      ctx.ui.notify(`Blocked unsafe command: ${command}`, "error");
            throw new Error(text);
        }
        console.log(`[comfyViewImgExt] Asset not found locally, letting through`);
    }
}

