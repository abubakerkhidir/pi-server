import { useEffect, useState, useCallback } from "react";
import type { AgentReplyEntity, UserSettings } from "@/frontend/types";
import { copyToClipboard, CopySvg, TextSvg } from "@/frontend/lib/clipboard";
import ToolBlock from "./ToolBlock";
import ThinkingBlock from "./ThinkingBlock";
import TextBlock from "./TextBlock";

interface AgentReplyProps {
  recordId: string;
  entities: AgentReplyEntity[];
  userSettings: UserSettings;
  globalToolsHidden: boolean;
  globalThinkHidden: boolean;
}

/**
 * Renders a single agent reply block with per-reply visibility controls.
 *
 * - Has its own local state for toolsHidden, thinkHidden, collapsed.
 * - A useEffect watches `globalToolsHidden` / `globalThinkHidden` and
 *   overrides local state when they change (parent → child, one-way).
 * - Local toggle clicks only update local state — they do NOT propagate up.
 */
export default function AgentReply({
  recordId,
  entities,
  userSettings,
  globalToolsHidden,
  globalThinkHidden,
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
      if (!collapsed) entityJsx.push(<TextBlock key={entity.id} entity={entity} />);
    } else if (entity.type === "think") {
      if (!thinkHidden && !collapsed) {
        entityJsx.push(
          <ThinkingBlock key={entity.id} entity={entity} userSettings={userSettings} />,
        );
      }
    } else if (entity.type === "tool") {
      if (!toolsHidden && !collapsed) {
        entityJsx.push(
          <ToolBlock key={entity.id} entity={entity} userSettings={userSettings} />,
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
            <button className="copy-btn labeled" title="Copy entire reply" onClick={copyAllText}>
              <CopySvg size={13} />
              <span>copy all reply</span>
            </button>
            <button className="copy-btn labeled" title="Copy text only" onClick={copyTextOnly}>
              <TextSvg size={13} />
              <span>copy text</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
