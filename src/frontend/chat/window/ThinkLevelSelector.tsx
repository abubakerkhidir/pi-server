import { useEffect, useState } from "react";
import { getThinkingInfo, setThinkingLevel } from "@/frontend/api";

interface ThinkLevelSelectorProps {
  sessionId: string | null;
  /** When model changes or session changes, re-fetch */
  modelId: string | null;
  /** Provider of the model (e.g. "openrouter") */
  modelProvider: string | null;
}

const LEVEL_LABELS: Record<string, string> = {
  off: "off",
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
  xhigh: "max",
};

export default function ThinkLevelSelector({ sessionId, modelId, modelProvider }: ThinkLevelSelectorProps) {
  const [available, setAvailable] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId && modelId) {
      // No session yet — use model info directly to show available levels
      getThinkingInfo("", modelId, modelProvider ?? undefined)
        .then((info) => {
          setAvailable(info.available ?? []);
          setCurrent(info.current);
        })
        .catch(() => {});
      return;
    }
    getThinkingInfo(sessionId, modelId ?? undefined, modelProvider ?? undefined)
      .then((info) => {
        setAvailable(info.available ?? []);
        setCurrent(info.current);
      })
      .catch(() => {});
  }, [sessionId, modelId]);

  // Only require available levels; sessionId can be empty when showing model-based levels
  if (available.length === 0) return null;

  const handleChange = async (level: string) => {
    if (loading) return;
    setLoading(true);
    try {
      // Only update level if we have a session; otherwise it's model-only display
      if (sessionId) {
        const res = await setThinkingLevel(sessionId, level);
        setCurrent(res.level);
      } else {
        setCurrent(level); // just update local state for display
      }
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
