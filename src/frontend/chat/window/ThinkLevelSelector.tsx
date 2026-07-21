import { useEffect, useState } from "react";
import { getThinkingInfo } from "@/frontend/api";

interface ThinkLevelSelectorProps {
  sessionId: string | null;
  modelId: string | null;
  modelProvider: string | null;
  currentLevel: string | null;
  onLevelChange: (level: string) => void;
  disabled: boolean;
}

const LEVEL_LABELS: Record<string, string> = {
  off: "off",
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
  xhigh: "max",
};

export default function ThinkLevelSelector({
  sessionId,
  modelId,
  modelProvider,
  currentLevel,
  onLevelChange,
  disabled,
}: ThinkLevelSelectorProps) {
  const [available, setAvailable] = useState<string[]>([]);
  const [displayLevel, setDisplayLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch available levels when model or session changes
  useEffect(() => {
    const fetchLevels = async () => {
      if (!modelId) return;
      setLoading(true);
      try {
        const info = await getThinkingInfo(
          sessionId ?? undefined,
          modelId,
          modelProvider ?? undefined
        );
        setAvailable(info.available ?? []);
        
        // Determine the display level
        if (sessionId && info.current) {
          // Session active: use server-reported current level
          setDisplayLevel(info.current);
        } else if (!sessionId) {
          // No session: use the parent's currentLevel (auto-set from default)
          // Fall back to available levels if parent's level isn't in available
          if (info.available.includes(currentLevel ?? "")) {
            setDisplayLevel(currentLevel);
          } else {
            // Find closest available level
            const fallback = info.available.find(lvl => {
              const idx = info.available.indexOf(lvl);
              const currentIdx = info.available.indexOf(currentLevel ?? "");
              return currentIdx >= 0 ? idx <= currentIdx : true;
            }) ?? info.available[0];
            setDisplayLevel(fallback);
          }
        }
      } catch {
        // ignore
      }
      setLoading(false);
    };
    fetchLevels();
  }, [sessionId, modelId]);

  // Update display when parent's currentLevel changes
  useEffect(() => {
    if (!sessionId && currentLevel && available.includes(currentLevel)) {
      setDisplayLevel(currentLevel);
    }
  }, [currentLevel, sessionId, available]);

  if (available.length === 0) return null;

  const handleChange = (level: string) => {
    if (disabled) return;
    setDisplayLevel(level);
    onLevelChange(level);
  };

  return (
    <div className="think-level-selector" title="Thinking level">
      <span className="think-level-label">think:</span>
      <div className="think-level-options">
        {available.map((lvl) => (
          <button
            key={lvl}
            className={`think-level-btn${displayLevel === lvl ? " active" : ""}`}
            disabled={disabled}
            onClick={() => handleChange(lvl)}
          >
            {LEVEL_LABELS[lvl] ?? lvl}
          </button>
        ))}
      </div>
    </div>
  );
}
