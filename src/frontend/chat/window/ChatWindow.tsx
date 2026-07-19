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
  const prevRecordCount = useRef(chatState.records.length);

  // ── Global visibility controls (chat-level) ──
  const [globalToolsHidden, setGlobalToolsHidden] = useState(false);
  const [globalThinkHidden, setGlobalThinkHidden] = useState(false);

  // Detect if any record has tools / think (to show global controls)
  const hasAnyTools = useMemo(() => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "tool")),[chatState.records]);
  const hasAnyThink = useMemo(() => chatState.records.some((r) => r.agentReply.entities.some((e) => e.type === "think")),[chatState.records]);

  useEffect(()=>setupScrolListner(chatRef,onScrollAwayChange),[])
  // ── Auto-scroll during streaming ──
  useEffect(() => autoScroll(chatState, prevRecordCount,showScrollDown, chatRef,onScrollAwayChange), [chatState.records]);
  
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

  console.log('render wind: ',renderedRecords.length)
  return (
    <div className="chat" id="chatMessages">
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

      {renderedRecords.map((rec) => (
        <div key={rec.userId}>
          <div className="message user">
            <div className="message-header">You</div>
            <div className="message-content">
              <div className="markdown" dangerouslySetInnerHTML={{ __html: parsedUser(rec) }} />
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
            tokenStats={rec.tokenStats}
          />
        </div>
      ))}
      <div id="chatBtmRef" ref={chatRef} />
    </div>
  );
}

function setupScrolListner(chatRef:any, onScrollAwayChange:any){
  const myDiv = chatRef.current?.parentElement;
  if(!myDiv) return
  const listner = (event:any) => {
    //console.log('scrol-listner...')
    if (event.deltaY < 0) {
      //console.log('User scrolled UP');
      onScrollAwayChange(true)
    }
  }
  myDiv.addEventListener('wheel',listner)
  return ()=>{
    if(myDiv)
      myDiv.removeEventListener('wheel',listner)
  }
}

function autoScroll(chatState:ChatState, prevRecordCount:any,manualScroll:any, chatRef:any,onScrollAwayChange:any){
    const lastRecord = chatState.records[chatState.records.length-1]
    if(!lastRecord){
        console.log('skip as no record')
        return
    }
    const recordsAdded = chatState.records.length > prevRecordCount.current;
    prevRecordCount.current = chatState.records.length;
    if (recordsAdded) {
      onScrollAwayChange?.(false)
      handleScrolToBtm(chatRef, false);
      //console.log('scrolled due to new records')
      return;
    }

    // During streaming: only auto-scroll if user hasn't scrolled up
    const hasUnsealed = lastRecord.agentReply.entities.some((e) => !e.sealed);
    //console.log('unsealed: ',hasUnsealed)
    if (!hasUnsealed){
        //console.log('skip before unsealed')
        return;
    }
    if (manualScroll){
        //console.log('skipped due to manual scroll')
        return;
    }

    handleScrolToBtm(chatRef, false);
}

export function scrollToBtm(){
  handleScrollToBtmDiv(document.getElementById("chatBtmRef"), false);
}

export function handleScrolToBtm(endRef: React.RefObject<HTMLDivElement | null>, small: boolean) {
  handleScrollToBtmDiv(endRef.current, small);
}

export function handleScrollToBtmDiv(btmDiv: any | null, small: boolean) {
  btmDiv?.scrollIntoView({ behavior: "smooth" });
  setTimeout(() => {
    btmDiv?.scrollIntoView({ behavior: "smooth" });
    if (small) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, 100);
}

