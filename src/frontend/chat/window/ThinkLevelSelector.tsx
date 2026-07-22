import { setThinkingLevel } from "@/frontend/api";
import { ModelInfo } from "@/frontend/types";

interface ThinkLevelSelectorProps {sessionId?: string; model?: ModelInfo; level?:string, onLevelChange: (level: string) => void; disabled: boolean;}


export default function ThinkLevelSelector({sessionId,model,level,onLevelChange,disabled}: ThinkLevelSelectorProps) {
  if (!model?.thinkLevels?.length) return null;
  const handleChange = async (level: string) => {
    if (disabled) return;
    if(sessionId){
      await setThinkingLevel(sessionId,level)
    }
    onLevelChange(level);
  }
  return (
    <div className="think-level-selector" title="Thinking level">
      <span className="think-level-label">think:</span>
      <div className="think-level-options">
        {model?.thinkLevels?.map((lvl) => (
          <button key={lvl} className={`think-level-btn${level === lvl ? " active" : ""}`} disabled={disabled} onClick={() => handleChange(lvl)}>
            {lvl}
          </button>
        ))}
      </div>
    </div>
  );
}
