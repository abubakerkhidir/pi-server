import React, { useEffect, useState } from "react";
import type { CompactData } from "@/frontend/types";

function CompactBlock({ id, summary, tokensBefore, tokensAfter, savedPct, startedAt, duration, sealed,failed }: CompactData) {
  const [expanded, setExpanded] = useState(true);
  const maxH = expanded ? "" : "0px";
  const disVal = expanded ? "block" : "none";
  useEffect(() => { if (sealed) setExpanded(false); }, [sealed]);

  const durationSec = duration != null ? Math.round(duration / 1000) : null;
  const tokenInfo = tokensBefore != null && tokensAfter != null
    ? `${tokensBefore.toLocaleString()} → ${tokensAfter.toLocaleString()} tokens${savedPct != null ? ` (${savedPct}% saved)` : ""}`
    : null;

  const title = [failed?'compaction failed!':(durationSec != null ? `compacted in ${durationSec}s` : "compacting..."), tokenInfo,].filter(Boolean).join(" · ");

  return (
    <div className="compact-block">
      <div className="cb-header">
        <span className="arr-btn" title={expanded ? "Collapse" : "Expand"} onClick={() => setExpanded(!expanded)}>
          {expanded ? "▲" : "▶"}
        </span>
        {!sealed && <span className="spinner" />}
        <span className="cb-label">{title}</span>
        {durationSec != null && <span className="tool-duration">{durationSec}s</span>}
      </div>
      <div className="cb-body" style={{ maxHeight: maxH, display: disVal }}>
        <div className="cb-content">{summary || "Compacting context..."}</div>
      </div>
    </div>
  );
}

export default React.memo(CompactBlock)
