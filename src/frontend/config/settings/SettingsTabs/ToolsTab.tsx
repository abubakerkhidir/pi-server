import type { Settings, ToolGroup } from "@/frontend/types";

interface ToolsTabProps {
  toolGroups: ToolGroup[];
  enabledTools: string[];
  onChange: (field: keyof Settings, value: unknown) => void;
}

export default function ToolsTab({ toolGroups, enabledTools, onChange }: ToolsTabProps) {
  const handleGroupChange = (groupName: string, checked: boolean) => {
    const group = toolGroups.find((g) => g.name === groupName);
    if (!group) return;
    const updated = new Set(enabledTools);
    group.tools.forEach((t) => { checked ? updated.add(t.name) : updated.delete(t.name); });
    onChange("tools_enabled", Array.from(updated));
  };

  const handleToolChange = (toolName: string, checked: boolean) => {
    const updated = new Set(enabledTools);
    checked ? updated.add(toolName) : updated.delete(toolName);
    onChange("tools_enabled", Array.from(updated));
  };

  return (
    <div className="settings-section">
      <h3>Tools</h3>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
        Tools enabled for pi. Disabled tools are excluded to save context.
      </p>
      {toolGroups.map((group) => {
        const allChecked = group.tools.every((t) => enabledTools.includes(t.name));
        const someChecked = group.tools.some((t) => enabledTools.includes(t.name));
        return (
          <div key={group.name} className="tool-group" data-group-name={group.name}>
            <div className="setting-item group-header">
              <label style={{ fontWeight: 600 }}>{group.name}</label>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                onChange={(e) => handleGroupChange(group.name, e.target.checked)}
              />
            </div>
            {group.tools.map((tool) => (
              <div key={tool.name} className="setting-item" style={{ paddingLeft: 16 }}>
                <label>
                  {tool.name}{" "}
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>— {tool.description}</span>
                </label>
                <input type="checkbox" checked={enabledTools.includes(tool.name)} onChange={(e) => handleToolChange(tool.name, e.target.checked)} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
