import { setThinkingLevel } from "@/frontend/api";
import { BackendSession, ModelInfo } from "@/frontend/types";
import { useEffect } from "react";

interface ThinkLevelSelectorProps {
  sessionId?: string;
  model?: ModelInfo;
  level?: string;
  onLevelChange: (level: string) => void;
  disabled: boolean;
  currentSession?: BackendSession  
}

export default function ThinkLevelSelector({sessionId, model, level, onLevelChange, disabled, currentSession}: ThinkLevelSelectorProps) {
  if (!model?.thinkLevels?.length) return null;

  //set the think-level on session-resume (using session meta-data)
  useEffect(() => {
    if(currentSession?.id && currentSession?.think_level){
      onLevelChange(currentSession.think_level)
    }
  },[currentSession?.id])

  //set the think-level on model-change
  useEffect(() => {
    if(model?.id && model.thinkLevels?.length){
      onLevelChange(model.thinkLevels?.find(k=>k===level)??model.thinkLevels[0])
    }
  },[model])
  

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
