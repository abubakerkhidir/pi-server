import { useEffect, useState, useCallback } from "react";
import type { AgentReplyEntity, UserSettings } from "@/frontend/types";
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
        </div>
      )}
    </div>
  );
}
