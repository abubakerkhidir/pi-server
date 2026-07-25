import { useEffect, useRef, useState } from "react";
import type { BackendSession, SamplingParams, UserSettings } from "@/frontend/types";

interface SamplingParamsModalProps {
  sessionId?: string;
  userSettings: UserSettings;
  currentSession?: BackendSession;
  onSamplingChange: (params: SamplingParams) => void;
  disabled: boolean;
}

export default function SamplingParamsModal({
  sessionId,
  userSettings,
  currentSession,
  onSamplingChange,
  disabled,
}: SamplingParamsModalProps) {
  const [open, setOpen] = useState(false);
  const [temperature, setTemperature] = useState<string>("");
  const [topP, setTopP] = useState<string>("");
  const [topK, setTopK] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load sampling params from current session on resume
  useEffect(() => {
    if (currentSession?.id) {
      setTemperature(
        currentSession.sampling_temperature != null
          ? String(currentSession.sampling_temperature)
          : ""
      );
      setTopP(
        currentSession.sampling_top_p != null
          ? String(currentSession.sampling_top_p)
          : ""
      );
      setTopK(
        currentSession.sampling_top_k != null
          ? String(currentSession.sampling_top_k)
          : ""
      );
    }
  }, [currentSession?.id]);

  // Load sampling params from settings on initial load
  useEffect(() => {
    if (!currentSession?.id) {
      if (userSettings.sampling_temperature != null) {
        setTemperature(String(userSettings.sampling_temperature));
      }
      if (userSettings.sampling_top_p != null) {
        setTopP(String(userSettings.sampling_top_p));
      }
      if (userSettings.sampling_top_k != null) {
        setTopK(String(userSettings.sampling_top_k));
      }
      applyParamsToState(userSettings.sampling_temperature, userSettings.sampling_top_p, userSettings.sampling_top_k, onSamplingChange);
    }
  }, [userSettings]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) {
        setOpen(false);
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 10);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const handleApply = () => {
    applyParamsToState(temperature, topP, topK, onSamplingChange);
    setOpen(false);
  };

  const handleReset = () => {
    setTemperature("");
    setTopP("");
    setTopK("");
    onSamplingChange({ temperature: null, top_p: null, top_k: null });
    setOpen(false);
  };

  const hasAnyValue = temperature !== "" || topP !== "" || topK !== "";

  return (
    <div className="sampling-params-modal" ref={dropdownRef}>
      <button
        className="toolbar-button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen(true);
        }}
        disabled={disabled}
        title="Sampling parameters"
        style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        🎲
        {hasAnyValue && <span className="sampling-indicator">•</span>}
      </button>

      {open && !disabled && (
        <div
          className="sampling-dropdown"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            padding: 12,
            minWidth: 200,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
            Sampling Parameters
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 2 }}>
              Temperature
            </label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder="e.g. 0.7"
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 2 }}>
              Top P
            </label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => setTopP(e.target.value)}
              placeholder="e.g. 0.9"
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 2 }}>
              Top K
            </label>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={topK}
              onChange={(e) => setTopK(e.target.value)}
              placeholder="e.g. 40"
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleApply}
              style={{
                flex: 1,
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "none",
                background: "var(--accent)",
                color: "var(--text-on-accent)",
                cursor: "pointer",
              }}
            >
              Apply
            </button>
            <button
              onClick={handleReset}
              style={{
                flex: 1,
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type Val = string | number | null | undefined;

function applyParamsToState(temperature: Val, topP: Val, topK: Val, onSamplingChange: (params: SamplingParams) => void) {
  const params: SamplingParams = {
    temperature: temperature&&temperature.toString().length? Number(temperature) : null,
    top_p: topP&&topP.toString().length? Number(topP) : null,
    top_k: topK &&topK.toString().length ? Number(topK) : null,
  };
  onSamplingChange(params);
}
