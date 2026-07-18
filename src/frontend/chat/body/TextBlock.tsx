import React, { } from "react";
import type { MsgData } from "@/frontend/types";
import { copyToClipboard, CopySvg } from "@/frontend/lib/clipboard";
import { marked } from "marked";

function normalizeMessageContent(content: string): string {
  return content
    .replace(/(<[A-Za-z][^<>]*?)\s*\/\s*\n\s*>/g, "$1 />")
    .replace(/(<[A-Za-z][^<>]*?)\s*\n\s*>/g, "$1>");
}

function TextBlock({ entity,content,sealed }: { entity: MsgData,content?: string, sealed?: boolean }) {
  const parsed = marked.parse(normalizeMessageContent(entity.content)) || "";

  return (
    <div className="entity-block entity-msg">
      <div className="markdown" dangerouslySetInnerHTML={{ __html: parsed as string }} />
      <div className="entity-footer">
        <button
          className="copy-btn"
          title="Copy content"
          onClick={() => copyToClipboard(entity.content)}
        >
          <CopySvg size={12} />
        </button>
      </div>
    </div>
  );
}

export default React.memo(TextBlock)