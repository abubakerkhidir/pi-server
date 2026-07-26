import { CopyBtn } from "@/frontend/lib/clipboard";
import { autoScroll, setupBtmVisibilityObserver, setupScrolListner, setupTopScrollObserver } from "@/frontend/chat/window/chat-utils/scrollUtils";
import type { ChatState, UserMsg, UserSettings } from "@/frontend/types";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import AgentReply from "../body/AgentReply";

marked.setOptions({ breaks: true, gfm: true });

interface ChatWindowProps {
  chatState: ChatState;
  userSettings: UserSettings;
  setShowScrollDown?: (isAway: boolean) => void;
  showScrollDown?: boolean;
  onScrollDownClick?: () => void;
  hasMoreRecords?: boolean;
  recordsTotal?: number;
  onLoadMoreRecords?: () => void;
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
  setShowScrollDown,
  showScrollDown,
  hasMoreRecords = false,
  recordsTotal = 0,
  onLoadMoreRecords,
}: ChatWindowProps) {
  const chatRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const prevRecordCount = useRef(chatState.records.length);
  const prevFirstRecordId = useRef<string | null>(chatState.records[0]?.id ?? null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // ── Global visibility controls (chat-level) ──
  const [globalToolsHidden, setGlobalToolsHidden] = useState(false);
  const [globalThinkHidden, setGlobalThinkHidden] = useState(false);

  // Detect if any record has tools / think (to show global controls)
  const hasAnyTools = useMemo(() => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "tool")),[chatState.records]);
  const hasAnyThink = useMemo(() => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "think")),[chatState.records]);

  useEffect(()=>setupScrolListner(chatRef,setShowScrollDown),[])
  useEffect(()=>setupBtmVisibilityObserver(chatRef,setShowScrollDown),[])

  // ── Auto-scroll during streaming ──
  useEffect(() => autoScroll(chatState, prevRecordCount,showScrollDown, chatRef,setShowScrollDown, prevFirstRecordId), [chatState.records]);

  // ── Scroll-to-top detection for loading more records ──
  useEffect(() => setupTopScrollObserver(topSentinelRef, chatRef, hasMoreRecords, isLoadingMore, onLoadMoreRecords, setIsLoadingMore), [hasMoreRecords, isLoadingMore, onLoadMoreRecords, chatState.records.length]);
  
  const renderedRecords = useMemo(() => {
    return chatState.records.map((record) => {
      const userHtml = renderUserMsg(record.userMsg);
      return {
        userHtml,
        userId: record.id,
        entities: record.agentReply.entities,
        tokenStats: record.agentReply.tokenStats,
        hasTools: record.agentReply.entities.some((e) => e.type === "tool"),
        hasThink: record.agentReply.entities.some((e) => e.type === "think"),
      };
    });
  }, [chatState.records]);

  const parsedUser = (rec:any)=> marked.parse(rec.userHtml) || "";

  //console.log('render wind: ',renderedRecords.length)
  return (
    <div className="chat" id="chatMessages">
      {/* ── Load more indicator at top ── */}
      {hasMoreRecords && (
        <div ref={topSentinelRef} className="load-more-records">
          {isLoadingMore ? (
            <span className="loading-indicator">Loading older messages...</span>
          ) : (
            <span className="load-more-hint">Scroll up to load older messages</span>
          )}
        </div>
      )}

      {/* ── Global visibility controls ── */}
      {(hasAnyTools || hasAnyThink) && (
        <div className="global-agent-controls">
          {hasAnyTools && (
            <span className="agent-control-link" onClick={() => setGlobalToolsHidden((p) => !p)}>
              {globalToolsHidden ? "show all tools" : "hide all tools"}
            </span>
          )}
          {hasAnyThink && (
            <span className="agent-control-link" onClick={() => setGlobalThinkHidden((p) => !p)}>
              {globalThinkHidden ? "show all think" : "hide all think"}
            </span>
          )}
        </div>
      )}

      {/* ── user/agent records ── */}
      {renderedRecords.map((rec) => (
        <div key={rec.userId}>
          <div className="message user">
            <div className="message-header">You</div>
            <div className="message-content">
              <div className="markdown" dangerouslySetInnerHTML={{ __html: parsedUser(rec) }} />
              <div className="message-footer"><CopyBtn title="Copy prompt" divContent={rec.userHtml} /></div>
            </div>
          </div>
          <AgentReply recordId={rec.userId} entities={rec.entities} userSettings={userSettings} globalToolsHidden={globalToolsHidden}
            globalThinkHidden={globalThinkHidden} tokenStats={rec.tokenStats}/>
        </div>
      ))}
      <div id="chatBtmRef" ref={chatRef} />
    </div>
  );
}