import { useMemo, useRef, useEffect } from "react";
import { marked } from "marked";
import type { ChatState, UserSettings, UserMsg } from "@/frontend/types";
import ToolBlock from "../body/ToolBlock";
import ThinkingBlock from "../body/ThinkingBlock";
import TextBlock from "../body/TextBlock";

marked.setOptions({ breaks: true, gfm: true });

interface ChatWindowProps {
  chatState: ChatState;
  userSettings: UserSettings;
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

export default function ChatWindow({ chatState, userSettings }: ChatWindowProps) {
  const chatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever records change (happens on every stream tick)
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    // Only auto-scroll during streaming (when last record has unsealed entities)
    const lastRecord = chatState.records[chatState.records.length - 1];
    if (!lastRecord) return;
    const hasUnsealed = lastRecord.agentReply.entities.some((e) => !e.sealed);
    if (!hasUnsealed) return;
    handleScrolToBtm(chatRef, false)
  }, [chatState.records]);

  const renderedRecords = useMemo(() => {
    return chatState.records.map((record) => {
      // User message
      const userHtml = renderUserMsg(record.userMsg);
      // Agent reply entities
      const entityJsx: React.ReactNode[] = [];
      for (const entity of record.agentReply.entities) {
	  if (entity.type === "msg") {
            entityJsx.push(
              <TextBlock key={entity.id} entity={entity} />,
            );
          } else if (entity.type === "think") {
            entityJsx.push(
              <ThinkingBlock key={entity.id} entity={entity} userSettings={userSettings} />,
            );
          } else if (entity.type === "tool") {
            entityJsx.push(
              <ToolBlock key={entity.id} entity={entity} userSettings={userSettings} />,
            );
          }
      }
      return { userHtml, entityJsx, agentId: record.agentReply.id, userId: record.id };
    });
  }, [chatState, userSettings]);

  return (
    <div className="chat" id="chatMessages" >
      {/* User messages + agent replies interleaved */}
      {renderedRecords.map((rec) => (
        <div key={rec.userId}>
          <div className="message user">
            <div className="message-header">You</div>
            <div className="message-content" dangerouslySetInnerHTML={{ __html: rec.userHtml }} />
          </div>
          <div className="message assistant">
            <div className="message-header">PI</div>
            <div className="message-content">
              <div className="message-flow">{rec.entityJsx}</div>
            </div>
          </div>
        </div>
      ))}
      <div ref={chatRef} />
    </div>
  );
}

export function handleScrolToBtm(endRef: React.RefObject<HTMLDivElement | null>, small: boolean) {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
        // Additional mobile scroll fix
        if (small) {
            window.scrollTo(0, document.body.scrollHeight);
        }
    }, 100);
}
