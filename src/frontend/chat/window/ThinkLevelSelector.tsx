import { useEffect, useState } from "react";
import { getThinkingInfo, setThinkingLevel } from "@/frontend/api";

interface ThinkLevelSelectorProps {
  sessionId: string | null;
  /** When model changes or session changes, re-fetch */
  modelId: string | null;
}

const LEVEL_LABELS: Record<string, string> = {
  off: "off",
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
  xhigh: "max",
};

export default function ThinkLevelSelector({ sessionId, modelId }: ThinkLevelSelectorProps) {
  const [available, setAvailable] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    getThinkingInfo(sessionId)
      .then((info) => {
        setAvailable(info.available ?? []);
        setCurrent(info.current);
      })
      .catch(() => {});
  }, [sessionId, modelId]);

  if (!sessionId || available.length === 0) return null;

  const handleChange = async (level: string) => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await setThinkingLevel(sessionId, level);
      setCurrent(res.level);
    } catch {}
    setLoading(false);
  };

  return (
    <div className="think-level-selector" title="Thinking level">
      <span className="think-level-label">think:</span>
      <div className="think-level-options">
        {available.map((lvl) => (
          <button
            key={lvl}
            className={`think-level-btn${current === lvl ? " active" : ""}`}
            disabled={loading}
            onClick={() => handleChange(lvl)}
          >
            {LEVEL_LABELS[lvl] ?? lvl}
          </button>
        ))}
      </div>
    </div>
  );
}
