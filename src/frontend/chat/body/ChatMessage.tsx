import { useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import type { ChatMessageProps } from "@/frontend/types";
import ThinkingBlock from "./ThinkingBlock";
import ToolBlock from "./ToolBlock";

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

export default function ChatMessage({ message, role, isStreaming = false }: ChatMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Render markdown for assistant messages
  const renderedContent = useMemo(() => {
    if (role === "user" || !message.content || message.content === "(no text response)") {
      return null;
    }
    return marked.parse(message.content);
  }, [message.content, role]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [message.content]);

  if (role === "user") {
    return (
      <div className="message user">
        <div className="message-header">You</div>
        <div className="message-content">
          <p dangerouslySetInnerHTML={{ __html: escapeHtmlSimple(message.content) }} />
        </div>
      </div>
    );
  }

  // Assistant message with streaming support
  return (
    <div className="message assistant">
      <div className="message-header">PI</div>
      <div className="message-content">
        <div className="message-flow" ref={contentRef}>
          {/* Markdown response */}
          {renderedContent && (
            <div
              className="markdown"
              dangerouslySetInnerHTML={{ __html: renderedContent as string }}
            />
          )}
          {/* Typing indicator during streaming */}
          {isStreaming && (
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
