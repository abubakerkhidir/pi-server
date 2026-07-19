/**
 * Copy text to clipboard, works in all contexts (including insecure HTTP).
 * Falls back to the legacy `document.execCommand('copy')` method.
 */
export function copyToClipboard(text: string): void {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string): void {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  } catch {
    // Clipboard unavailable
  }
}

/** Clipboard SVG icon (two overlapping documents) */
export function CopySvg({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

/** Text/"T" SVG icon for text-only copy */
export function TextSvg({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

export function CopyBtn(p:{divContent?:string, className?:string,title:string}){
  return (
    <button className={p.className??"copy-btn"} title={p.title} onClick={getCopyBtnHandler(p.divContent)}>
      <CopySvg />
    </button>
  )
}


function getCopyBtnHandler(divContent?: string){
  return () => {
    if(divContent){
      const text = divContent.replace(/<[^>]*>/g, "");
      copyToClipboard(text);
    }
  };
}
