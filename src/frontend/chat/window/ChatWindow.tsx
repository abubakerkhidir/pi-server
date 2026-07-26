import { CopyBtn } from "@/frontend/lib/clipboard";
import { formatDateTime } from "@/frontend/lib/formatDateTime";
import { setupTopScrollObserver } from "@/frontend/chat/window/chat-utils/scrollUtils";
import type { ChatState, UserMsg, UserSettings } from "@/frontend/types";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const prevRecordCount = useRef(chatState.records.length);
  const prevFirstRecordId = useRef<string | null>(chatState.records[0]?.id ?? null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [globalToolsHidden, setGlobalToolsHidden] = useState(false);
  const [globalThinkHidden, setGlobalThinkHidden] = useState(false);

  const hasAnyTools = useMemo(() => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "tool")), [chatState.records]);
  const hasAnyThink = useMemo(() => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "think")), [chatState.records]);

  const recordCount = chatState.records.length;

  // ── Virtualizer ──
  const virtualizer = useVirtualizer({
    count: recordCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 200,
    getItemKey: (index) => chatState.records[index]?.id ?? `idx-${index}`,
    anchorTo: "end",
    followOnAppend: true,
    scrollEndThreshold: 80,
    overscan: 8,
  });

  // ── Auto-scroll to bottom on new records (streaming / session load) ──
  useEffect(() => {
    const currentFirstId = chatState.records[0]?.id ?? null;
    const prevFirstId = prevFirstRecordId.current;
    if (prevFirstRecordId) prevFirstRecordId.current = currentFirstId;
    const prevCount = prevRecordCount.current;
    prevRecordCount.current = recordCount;

    // Records were prepended (pagination) — don't auto-scroll
    if (currentFirstId !== prevFirstId && prevFirstId !== null) return;

    // New records appended — scroll to bottom
    if (recordCount > prevCount) {
      setShowScrollDown?.(false);
      virtualizer.scrollToEnd();
      return;
    }

    // Streaming: auto-scroll only if user hasn't scrolled up and last record is unsealed
    const lastRecord = chatState.records[recordCount - 1];
    if (!lastRecord) return;
    const hasUnsealed = lastRecord.agentReply.entities.some((e) => !e.sealed);
    if (!hasUnsealed) return;
    if (showScrollDown) return; // user scrolled up manually

    virtualizer.scrollToEnd();
  }, [chatState.records, recordCount]);

  // ── Scroll-to-top detection for loading more records ──
  useEffect(() => {
    return setupTopScrollObserver(topSentinelRef, scrollContainerRef, hasMoreRecords, isLoadingMore, onLoadMoreRecords, setIsLoadingMore);
  }, [hasMoreRecords, isLoadingMore, onLoadMoreRecords, recordCount]);

  // ── Scroll-down button visibility via scroll listener ──
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !setShowScrollDown) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) setShowScrollDown(true);
    };
    el.addEventListener("wheel", onWheel);
    return () => el.removeEventListener("wheel", onWheel);
  }, [setShowScrollDown]);

  // ── Hide scroll-down button when at bottom ──
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !setShowScrollDown) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setShowScrollDown(false); },
      { threshold: 0.1 }
    );
    // Observe the last virtual item's DOM node
    const items = virtualizer.getVirtualItems();
    const lastItem = items[items.length - 1];
    if (lastItem) {
      const node = scrollContainerRef.current?.querySelector(`[data-index="${lastItem.index}"]`);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [virtualizer, recordCount]);

  // ── Rendered records (pre-parsed) ──
  const renderedRecords = useMemo(() => {
    return chatState.records.map((record) => ({
      userHtml: renderUserMsg(record.userMsg),
      userId: record.id,
      entities: record.agentReply.entities,
      tokenStats: record.agentReply.tokenStats,
      createdAt: record.created_at,
    }));
  }, [chatState.records]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="chat-virtualized" id="chatMessages" ref={scrollContainerRef} style={{ flex: 1, overflow: "auto", position: "relative" }}>
      {/* ── Load more indicator at top (outside virtualizer) ── */}
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

      {/* ── Virtual scroll container ── */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const rec = renderedRecords[virtualRow.index];
          if (!rec) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <RecordCard rec={rec} userSettings={userSettings} globalToolsHidden={globalToolsHidden} globalThinkHidden={globalThinkHidden} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Extracted record card to avoid re-renders ──
function RecordCard({ rec, userSettings, globalToolsHidden, globalThinkHidden }: {
  rec: { userHtml: string; userId: string; entities: any[]; tokenStats: any; createdAt?: string };
  userSettings: UserSettings;
  globalToolsHidden: boolean;
  globalThinkHidden: boolean;
}) {
  const formattedTime = rec.createdAt ? formatDateTime(rec.createdAt) : null;
  return (
    <div className="record-card">
      <div className="message user">
        <div className="message-header">
          You
          {formattedTime && (
            <span className="message-time">{formattedTime}</span>
          )}
        </div>
        <div className="message-content">
          <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(rec.userHtml) || "" }} />
          <div className="message-footer"><CopyBtn title="Copy prompt" divContent={rec.userHtml} /></div>
        </div>
      </div>
      <AgentReply
        recordId={rec.userId}
        entities={rec.entities}
        userSettings={userSettings}
        globalToolsHidden={globalToolsHidden}
        globalThinkHidden={globalThinkHidden}
        tokenStats={rec.tokenStats}
      />
    </div>
  );
}


