import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";

interface FileChipsProps {
  files: File[];
  onRemove: (index: number) => void;
}

export default function FileChips({ files, onRemove }: FileChipsProps) {
  if (files.length === 0) return null;

  return (
    <div className="preview-row">
      {files.map((file, index) => {
        const icon = file.type.startsWith("image/")
          ? "🖼"
          : file.type.startsWith("video/")
          ? "🎬"
          : "📄";
        const name = file.name.slice(0, 15);

        return (
          <span key={index} className="file-chip">
            <span className="chip-icon">{icon}</span>
            {escapeHtmlSimple(name)}
            <button
              className="chip-remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}
