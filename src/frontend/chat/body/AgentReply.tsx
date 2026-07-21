import { useEffect, useState, useCallback } from "react";
import type { AgentReplyEntity, UserSettings, TokenStats } from "@/frontend/types";
import { copyToClipboard, CopySvg, TextSvg } from "@/frontend/lib/clipboard";
import ToolBlock from "./ToolBlock";
import ThinkingBlock from "./ThinkingBlock";
import TextBlock from "./TextBlock";
import CompactBlock from "./CompactBlock";

interface AgentReplyProps {
  recordId: string;
  entities: AgentReplyEntity[];
  userSettings: UserSettings;
  globalToolsHidden: boolean;
  globalThinkHidden: boolean;
  tokenStats?: TokenStats;
}

/**
 * Renders a single agent reply block with per-reply visibility controls
 * and token usage statistics in the footer.
 */
export default function AgentReply({
  recordId,
  entities,
  userSettings,
  globalToolsHidden,
  globalThinkHidden,
  tokenStats,
}: AgentReplyProps) {
  const [toolsHidden, setToolsHidden] = useState(false);
  const [thinkHidden, setThinkHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // When the parent changes global state, override local state (one-way)
  useEffect(() => {
    setToolsHidden(globalToolsHidden);
  }, [globalToolsHidden]);

  useEffect(() => {
    setThinkHidden(globalThinkHidden);
  }, [globalThinkHidden]);

  const toggleTools = useCallback(() => setToolsHidden((p) => !p), []);
  const toggleThink = useCallback(() => setThinkHidden((p) => !p), []);
  const toggleCollapse = useCallback(() => setCollapsed((p) => !p), []);

  const hasTools = entities.some((e) => e.type === "tool");
  const hasThink = entities.some((e) => e.type === "think");

  const entityJsx: React.ReactNode[] = [];
  for (const entity of entities) {
    if (entity.type === "msg") {
      //console.log('agent-txt: ',entity.content.length)
      if (!collapsed) entityJsx.push(<TextBlock key={entity.id} id={entity.id} content={entity.content} sealed={entity.sealed} />);
    } else if (entity.type === "think") {
      if (!thinkHidden && !collapsed) {
        entityJsx.push(
          <ThinkingBlock
            key={entity.id}
            id={entity.id}
            userSettings={userSettings}
            content={entity.content}
            sealed={entity.sealed}
            duration={entity.duration}
            totalLength={entity.totalLength}
          />,
        );
      }
    } else if (entity.type === "tool") {
      if (!toolsHidden && !collapsed) {
        entityJsx.push(
          <ToolBlock key={entity.id} entity={entity} userSettings={userSettings} content={entity.args?.content} sealed={entity.sealed} />,
        );
      }
    } else if (entity.type === "compact") {
      if (!collapsed) {
        entityJsx.push(
          <CompactBlock
            key={entity.id}
            id={entity.id}
            summary={entity.summary}
            tokensBefore={entity.tokensBefore}
            tokensAfter={entity.tokensAfter}
            savedPct={entity.savedPct}
            startedAt={entity.startedAt}
            duration={entity.duration}
            sealed={entity.sealed}
            type="compact"
          />,
        );
      }
    }
  }

  /** Build plain text of the full reply (all entities) */
  const copyAllText = useCallback(() => {
    const parts = entities
      .map((e) => {
        if (e.type === "msg" || e.type === "think") return e.content;
        if (e.type === "tool") {
          let s = e.name;
          if (e.args) s += " " + JSON.stringify(e.args);
          if (e.result !== undefined) s += "\n" + JSON.stringify(e.result, null, 2);
          return s;
        }
        return "";
      })
      .filter(Boolean);
    copyToClipboard(parts.join("\n\n"));
  }, [entities]);

  /** Build plain text of only msg entities */
  const copyTextOnly = useCallback(() => {
    const parts = entities
      .filter((e) => e.type === "msg")
      .map((e) => (e as any).content || "");
    copyToClipboard(parts.join("\n\n"));
  }, [entities]);
  //console.log('render agent reply: ',entities.length)
  return (
    <div className="message assistant">
      <div className="message-header assistant-header-row">
        <span>PI</span>
        <span className="agent-controls">
          {hasTools && (
            <span className="agent-control-link" onClick={toggleTools}>
              {toolsHidden ? "show tools" : "hide tools"}
            </span>
          )}
          {hasThink && (
            <span className="agent-control-link" onClick={toggleThink}>
              {thinkHidden ? "show think" : "hide think"}
            </span>
          )}
          <span className="agent-control-link" onClick={toggleCollapse}>
            {collapsed ? "▼" : "▲"}
          </span>
        </span>
      </div>
      {!collapsed && (
        <div className="message-content">
          <div className="message-flow">{entityJsx}</div>
          <div className="agent-reply-footer">
            {/* ── Always render token-stats span to keep footer layout stable ── */}
            <span className="token-stats">
              {tokenStats ? (
                <>
                  <span className="token-stat" title="Prompt tokens">p:{tokenStats.prompt_tokens}</span>
                  <span className="token-stat" title="Think tokens">t:{tokenStats.think_tokens}</span>
                  <span className="token-stat" title="Output tokens">o:{tokenStats.output_tokens}</span>
                  <span className="token-stat" title="Time to first token">ttft:{tokenStats.ttft_ms}ms</span>
                  <span className="token-stat" title="Prompt tokens per second">{tokenStats.prompt_token_s} p/s</span>
                  <span className="token-stat" title="Output tokens per second">{tokenStats.output_token_s} o/s</span>
                </>
              ) : null}
            </span>
            <span className="agent-reply-footer-right">
              <button className="copy-btn labeled" title="Copy entire reply" onClick={copyAllText}>
                <CopySvg size={13} />
                <span>copy all reply</span>
              </button>
              <button className="copy-btn labeled" title="Copy text only" onClick={copyTextOnly}>
                <TextSvg size={13} />
                <span>copy text</span>
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
