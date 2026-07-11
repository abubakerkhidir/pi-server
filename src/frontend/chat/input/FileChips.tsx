import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import { useState, useEffect } from "react";

interface FileChipsProps {
  files: File[];
  onRemove: (index: number) => void;
}

export default function FileChips({ files, onRemove }: FileChipsProps) {
  return (
    <div className="file-chips-inner">
      {files.map((file, index) => {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        const name = file.name.length > 18 ? file.name.slice(0, 15) + "…" : file.name;

        return (
          <span key={index} className="file-chip">
            {isImage && <ChipImage file={file} />}
            {isVideo && <span className="chip-icon">🎬</span>}
            {!isImage && !isVideo && <span className="chip-icon">📄</span>}
            <span className="chip-name">{escapeHtmlSimple(name)}</span>
            <button
              className="chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
              title="Remove file"
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}

function ChipImage({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src) return <span className="chip-icon">🖼</span>;
  return <img src={src} alt="" className="chip-preview" />;
}
