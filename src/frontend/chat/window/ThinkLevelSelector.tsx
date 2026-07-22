import { setThinkingLevel } from "@/frontend/api";
import { ModelInfo } from "@/frontend/types";

interface ThinkLevelSelectorProps {
  sessionId?: string;
  model?: ModelInfo;
  level?: string;
  onLevelChange: (level: string) => void;
  disabled: boolean;
}

export default function ThinkLevelSelector({
  sessionId,
  model,
  level,
  onLevelChange,
  disabled,
}: ThinkLevelSelectorProps) {
  if (!model?.thinkLevels?.length) return null;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (disabled) return;
    const newLevel = e.target.value;
    if (sessionId) {
      await setThinkingLevel(sessionId, newLevel);
    }
    onLevelChange(newLevel);
  };

  return (
    <div className="think-level-selector" title="Thinking level">
      <span className="think-level-label">think:</span>
      <select
        className="think-level-select"
        value={level || ""}
        onChange={handleChange}
        disabled={disabled}
      >
        {model.thinkLevels.map((lvl) => (
          <option key={lvl} value={lvl}>
            {lvl}
          </option>
        ))}
      </select>
    </div>
  );
}
