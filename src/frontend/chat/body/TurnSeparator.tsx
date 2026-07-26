import React, { useState } from "react";
import type { TurnData } from "@/frontend/types";

function formatNum(n: number | null | undefined): string {
  if (n == null) return "–";
  return n.toLocaleString();
}

function formatRate(n: number | null | undefined): string {
  if (n == null || n === 0) return "–";
  return `${Math.round(n)} t/s`;
}

interface TurnSeparatorProps {
  entity: TurnData;
}

function TurnSeparator({ entity }: TurnSeparatorProps) {
  const [expanded, setExpanded] = useState(false);

  const titleParts: string[] = [];
  titleParts.push(`Turn ${entity.turn}`);
  if (entity.ttft_ms != null) titleParts.push(`ttft:${entity.ttft_ms}ms`);
  if (entity.cache_read > 0) titleParts.push(`cache:${formatNum(entity.cache_read)}`);
  titleParts.push(`in:${formatNum(entity.prompt_tokens)}`);
  titleParts.push(`out:${formatNum(entity.output_tokens)}`);
  if (entity.prompt_per_sec) titleParts.push(`${formatRate(entity.prompt_per_sec)}`);
  if (entity.output_per_sec) titleParts.push(`${formatRate(entity.output_per_sec)}`);
  if (entity.draft_n != null && entity.draft_n > 0) {
    const draftPct = Math.round((entity.draft_n_accepted ?? 0) / entity.draft_n * 100);
    titleParts.push(`draft:${draftPct}%`);
  }

  const title = titleParts.join(" · ");

  return (
    <div className="turn-separator">
      <div className="turn-separator-header" onClick={() => setExpanded(!expanded)}>
        <span className="arr-btn" title={expanded ? "Collapse" : "Expand"}>
          {expanded ? "▲" : "▶"}
        </span>
        <span className="turn-separator-label">{title}</span>
      </div>
      {expanded && (
        <div className="turn-separator-body">
          <table className="turn-stats-table">
            <tbody>
              <tr><td>Prompt tokens</td><td>{formatNum(entity.prompt_tokens)}</td></tr>
              <tr><td>Output tokens</td><td>{formatNum(entity.output_tokens)}</td></tr>
              {entity.think_tokens > 0 && <tr><td>Think tokens</td><td>{formatNum(entity.think_tokens)}</td></tr>}
              {entity.cache_read > 0 && <tr><td>Cache read</td><td>{formatNum(entity.cache_read)}</td></tr>}
              {entity.cache_write > 0 && <tr><td>Cache write</td><td>{formatNum(entity.cache_write)}</td></tr>}
              <tr><td>TTFT</td><td>{entity.ttft_ms != null ? `${entity.ttft_ms}ms` : "–"}</td></tr>
              <tr><td>Duration</td><td>{entity.duration_ms != null ? `${entity.duration_ms}ms` : "–"}</td></tr>
              {entity.prompt_per_sec != null && <tr><td>Prompt speed</td><td>{formatRate(entity.prompt_per_sec)}</td></tr>}
              {entity.output_per_sec != null && <tr><td>Output speed</td><td>{formatRate(entity.output_per_sec)}</td></tr>}
              {entity.prompt_ms != null && <tr><td>Prompt processing</td><td>{entity.prompt_ms}ms</td></tr>}
              {entity.predicted_ms != null && <tr><td>Prediction</td><td>{entity.predicted_ms}ms</td></tr>}
              {entity.predicted_per_second != null && <tr><td>Prediction speed</td><td>{formatRate(entity.predicted_per_second)}</td></tr>}
              {entity.predicted_per_token_ms != null && <tr><td>Per-token latency</td><td>{entity.predicted_per_token_ms.toFixed(2)}ms</td></tr>}
              {entity.draft_n != null && entity.draft_n > 0 && <tr><td>Draft tokens</td><td>{entity.draft_n} ({entity.draft_n_accepted} accepted, {Math.round((entity.draft_n_accepted ?? 0) / entity.draft_n * 100)}%)</td></tr>}
              {entity.tool_calls_count != null && entity.tool_calls_count > 0 && <tr><td>Tool calls</td><td>{entity.tool_calls_count}</td></tr>}
              <tr><td>Stop reason</td><td>{entity.stop_reason || "stop"}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default React.memo(TurnSeparator);
