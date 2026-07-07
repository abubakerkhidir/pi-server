import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { marked } from "marked";
import type { ChatState, UserSettings, UserMsg } from "@/frontend/types";
import AgentReply from "../body/AgentReply";
import { copyToClipboard, CopySvg } from "@/frontend/lib/clipboard";

marked.setOptions({ breaks: true, gfm: true });

interface ChatWindowProps {
  chatState: ChatState;
  userSettings: UserSettings;
  onScrollAwayChange?: (isAway: boolean) => void;
  showScrollDown?: boolean;
  onScrollDownClick?: () => void;
}

function renderUserMsg(userMsg: UserMsg): string {
  return `<p>${escapeHtml(userMsg.content)}</p>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function ChatWindow({
  chatState,
  userSettings,
  onScrollAwayChange,
  showScrollDown,
  onScrollDownClick,
}: ChatWindowProps) {
  const chatRef = useRef<HTMLDivElement>(null);
  const userScrolledAway = useRef(false);
  const prevRecordCount = useRef(chatState.records.length);

  // ── Global visibility controls (chat-level) ──
  const [globalToolsHidden, setGlobalToolsHidden] = useState(false);
  const [globalThinkHidden, setGlobalThinkHidden] = useState(false);

  // Detect if any record has tools / think (to show global controls)
  const hasAnyTools = useMemo(
    () => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "tool")),
    [chatState.records],
  );
  const hasAnyThink = useMemo(
    () => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "think")),
    [chatState.records],
  );

  // Detect when user manually scrolls up
  const handleScroll = useCallback(() => {
    const el = chatRef.current;
    if (!el) return;
    const threshold = 150;
    const away = el.scrollHeight - el.scrollTop - el.clientHeight > threshold;
    if (away !== userScrolledAway.current) {
      userScrolledAway.current = away;
      onScrollAwayChange?.(away);
    }
  }, [onScrollAwayChange]);

  // Auto-scroll during streaming, but respect user scrolling up
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;

    const lastRecord = chatState.records[chatState.records.length - 1];
    if (!lastRecord) return;

    if (chatState.records.length > prevRecordCount.current) {
      userScrolledAway.current = false;
      onScrollAwayChange?.(false);
    }
    prevRecordCount.current = chatState.records.length;

    const hasUnsealed = lastRecord.agentReply.entities.some((e) => !e.sealed);
    if (!hasUnsealed) return;
    if (userScrolledAway.current) return;

    handleScrolToBtm(chatRef, false);
  }, [chatState.records, onScrollAwayChange]);

  const renderedRecords = useMemo(() => {
    return chatState.records.map((record) => {
      const userHtml = renderUserMsg(record.userMsg);
      return {
        userHtml,
        userId: record.id,
        entities: record.agentReply.entities,
        hasTools: record.agentReply.entities.some((e) => e.type === "tool"),
        hasThink: record.agentReply.entities.some((e) => e.type === "think"),
      };
    });
  }, [chatState.records]);

  return (
    <div className="chat" id="chatMessages" onScroll={handleScroll}>
      {/* ── Global visibility controls ── */}
      {(hasAnyTools || hasAnyThink) && (
        <div className="global-agent-controls">
          {hasAnyTools && (
            <span
              className="agent-control-link"
              onClick={() => setGlobalToolsHidden((p) => !p)}
            >
              {globalToolsHidden ? "show all tools" : "hide all tools"}
            </span>
          )}
          {hasAnyThink && (
            <span
              className="agent-control-link"
              onClick={() => setGlobalThinkHidden((p) => !p)}
            >
              {globalThinkHidden ? "show all think" : "hide all think"}
            </span>
          )}
        </div>
      )}

      {renderedRecords.map((rec) => (
        <div key={rec.userId}>
          <div className="message user">
            <div className="message-header">You</div>
            <div className="message-content">
              <div dangerouslySetInnerHTML={{ __html: rec.userHtml }} />
              <div className="message-footer">
                <button
                  className="copy-btn"
                  title="Copy prompt"
                  onClick={() => {
                    const text = rec.userHtml.replace(/<[^>]*>/g, "");
                    copyToClipboard(text);
                  }}
                >
                  <CopySvg />
                </button>
              </div>
            </div>
          </div>
          <AgentReply
            recordId={rec.userId}
            entities={rec.entities}
            userSettings={userSettings}
            globalToolsHidden={globalToolsHidden}
            globalThinkHidden={globalThinkHidden}
          />
        </div>
      ))}
      {showScrollDown && (
        <div className="scroll-down-btn-wrapper">
          <button
            className="scroll-down-btn"
            onClick={onScrollDownClick}
            title="Scroll to bottom"
          >
            ↓
          </button>
        </div>
      )}
      <div ref={chatRef} />
    </div>
  );
}

export function handleScrolToBtm(
  endRef: React.RefObject<HTMLDivElement | null>,
  small: boolean,
) {
  endRef.current?.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (small) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, 100);
}
