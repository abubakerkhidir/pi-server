import { useMemo } from "react";
import { marked } from "marked";
import type { ChatState, UserSettings, UserMsg } from "@/frontend/types";
import ToolBlock from "../body/ToolBlock";
import ThinkingBlock from "../body/ThinkingBlock";

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
  const renderedRecords = useMemo(() => {
    return chatState.records.map((record) => {
      // User message
      const userHtml = renderUserMsg(record.userMsg);

      // Agent reply entities
      const entityJsx: React.ReactNode[] = [];
      let textBuffer = "";
      let textDivKey = 0;

      for (const entity of record.agentReply.entities) {
        if (entity.type === "msg") {
          textBuffer += entity.content;
        } else {
          // Flush any accumulated text before non-msg entity
          if (textBuffer) {
            const parsed = marked.parse(textBuffer) || "";
            entityJsx.push(
              <div className="markdown" key={`msg-${textDivKey++}`} dangerouslySetInnerHTML={{ __html: parsed as string }} />,
            );
            textBuffer = "";
          }
          if (entity.type === "think") {
            entityJsx.push(
              <ThinkingBlock key={entity.id} entity={entity} userSettings={userSettings} />,
            );
          } else if (entity.type === "tool") {
            entityJsx.push(
              <ToolBlock key={entity.id} entity={entity} userSettings={userSettings} />,
            );
          }
        }
      }

      // Flush remaining text
      if (textBuffer) {
        const parsed = marked.parse(textBuffer) || "";
        entityJsx.push(
          <div className="markdown" key={`msg-${textDivKey++}`} dangerouslySetInnerHTML={{ __html: parsed as string }} />,
        );
      }

      return { userHtml, entityJsx, agentId: record.agentReply.id, userId: record.id };
    });
  }, [chatState, userSettings]);

  return (
    <div className="chat" id="chatMessages">
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
    </div>
  );
}
