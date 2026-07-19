import React, { } from "react";
import { copyToClipboard, CopySvg } from "@/frontend/lib/clipboard";
import { marked } from "marked";

interface TextBlockProps {
  id: string;
  content: string;
  sealed?: boolean;
}

function normalizeMessageContent(content: string): string {
  return content
    .replace(/(<[A-Za-z][^<>]*?)\s*\/\s*\n\s*>/g, "$1 />")
    .replace(/(<[A-Za-z][^<>]*?)\s*\n\s*>/g, "$1>");
}

function TextBlock({ content, sealed }: TextBlockProps) {
  const parsed = marked.parse(normalizeMessageContent(content)) || "";
  console.log('render text: ',sealed,content.length)
  return (
    <div className="entity-block entity-msg">
      <div className="markdown" dangerouslySetInnerHTML={{ __html: parsed as string }} />
      <div className="entity-footer">
        <button
          className="copy-btn"
          title="Copy content"
          onClick={() => copyToClipboard(content)}
        >
          <CopySvg size={12} />
        </button>
      </div>
    </div>
  );
}

function areEqual(prev: TextBlockProps, next: TextBlockProps): boolean {
  return prev.id === next.id && prev.sealed === next.sealed && prev.content === next.content;
}

export default React.memo(TextBlock, areEqual)