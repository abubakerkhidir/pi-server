import { useState, useRef, useEffect } from "react";

interface ThumbTooltipProps {
  fileId: string;
  fileName: string;
  mime: string;
}

export default function ThumbTooltip({ fileId, fileName, mime }: ThumbTooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);

  if (!mime?.startsWith("image/")) return <>{fileName}</>;

  const show = (e: React.MouseEvent) => {
    activeRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPos({ x: e.clientX, y: e.clientY });
    if (!loaded && !loading && !error) {
      setLoading(true);
      const img = new Image();
      img.onload = () => { imgRef.current = img; setLoaded(true); setLoading(false); };
      img.onerror = () => { setError(true); setLoading(false); };
      img.src = `/api/chat/file/${fileId}`;
    }
  };

  const move = (e: React.MouseEvent) => {
    if (pos) setPos({ x: e.clientX, y: e.clientY });
  };

  const scheduleHide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!activeRef.current) setPos(null);
    }, 150);
  };

  const onNameLeave = () => { activeRef.current = false; scheduleHide(); };

  const onTooltipEnter = () => { activeRef.current = true; if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  const onTooltipLeave = () => { activeRef.current = false; scheduleHide(); };

  return (
    <>
      <span
        className="files-td-name"
        title={fileName}
        onMouseEnter={show}
        onMouseMove={move}
        onMouseLeave={onNameLeave}
      >
        {fileName}
      </span>
      {pos && (
        <div
          className="thumb-tooltip"
          style={{ position: "fixed", left: pos.x + 14, top: pos.y + 14, zIndex: 9999 }}
          onMouseEnter={onTooltipEnter}
          onMouseLeave={onTooltipLeave}
        >
          {loading && <div className="thumb-tooltip-loading">Loading...</div>}
          {error && <div className="thumb-tooltip-error">Failed to load</div>}
          {loaded && imgRef.current && (
            <img className="thumb-tooltip-img" src={imgRef.current.src} alt={fileName} />
          )}
        </div>
      )}
    </>
  );
}
