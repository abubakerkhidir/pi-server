import { useState, useEffect, useCallback } from "react";
import { getFiles, type FileRecord, type FilesResponse } from "@/frontend/api";
import ThumbTooltip from "./ThumbTooltip";

const MIME_ICONS: Record<string, string> = {
  "image/": "\uD83D\uDDBC",
  "video/": "\uD83C\uDFAC",
  "audio/": "\uD83C\uDFB5",
  "application/pdf": "\uD83D\uDCC4",
  "application/zip": "\uD83D\uDCE6",
  "application/x-zip": "\uD83D\uDCE6",
  "text/": "\uD83D\uDCC4",
  "application/json": "{}",
  "application/vnd.openxmlformats-officedocument": "\uD83D\uDCCA",
  "application/vnd.ms-excel": "\uD83D\uDCCA",
  "application/msword": "\uD83D\uDCC4",
};

function getFileIcon(mime: string): string {
  if (!mime) return "\uD83D\uDCC1";
  for (const [prefix, icon] of Object.entries(MIME_ICONS)) {
    if (mime.startsWith(prefix)) return icon;
  }
  return "\uD83D\uDCC1";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const FILE_TYPES = [
  { label: "All", value: "" },
  { label: "Images", value: "image/" },
  { label: "PDF", value: "application/pdf" },
  { label: "Documents", value: "application/vnd" },
  { label: "Spreadsheets", value: "application/vnd.openxmlformats-officedocument.spreadsheetml" },
  { label: "Text", value: "text/" },
  { label: "Video", value: "video/" },
  { label: "Audio", value: "audio/" },
  { label: "Archives", value: "application/zip" },
];

interface FilesPageProps {
  onBack: () => void;
}

export default function FilesPage({ onBack }: FilesPageProps) {
  const [data, setData] = useState<FilesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when search or type changes
  useEffect(() => { setPage(1); }, [debouncedSearch, typeFilter]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getFiles(page, 20, debouncedSearch || undefined, typeFilter || undefined);
      setData(result);
    } catch (err) {
      console.error("Failed to load files:", err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, typeFilter]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="files-page">
      <div className="files-header">
        <button className="files-back-btn" onClick={onBack}>{"\u2190"} Back</button>
        <h2 className="files-title">Session Files</h2>
        {data && <span className="files-total">{data.total} file{data.total !== 1 ? "s" : ""}</span>}
      </div>

      <div className="files-filters">
        <input
          className="files-search-input"
          type="text"
          placeholder="Search files or sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="files-type-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {FILE_TYPES.map((ft) => (
            <option key={ft.value} value={ft.value}>{ft.label}</option>
          ))}
        </select>
      </div>

      {loading && !data ? (
        <div className="files-loading">Loading...</div>
      ) : data && data.files.length === 0 ? (
        <div className="files-empty">No files found</div>
      ) : data ? (
        <>
          <div className="files-table-wrapper">
            <table className="files-table">
              <thead>
                <tr>
                  <th className="files-th-name">File Name</th>
                  <th className="files-th-session">Session</th>
                  <th className="files-th-type">Type</th>
                  <th className="files-th-mime">MIME</th>
                  <th className="files-th-size">Size</th>
                  <th className="files-th-date">Date</th>
                  <th className="files-th-action"></th>
                </tr>
              </thead>
              <tbody>
                {data.files.map((f) => (
                  <tr key={f.id} className="files-row">
                    <td className="files-td-name">
                      <ThumbTooltip fileId={f.id} fileName={f.file_name} mime={f.mime_type} />
                    </td>
                    <td className="files-td-session" title={f.session_name || ""}>{f.session_name || "\u2014"}</td>
                    <td className="files-td-type">
                      <span className={`files-type-badge files-type-${f.type}`}>{f.type}</span>
                    </td>
                    <td className="files-td-mime" title={f.mime_type}>{f.mime_type}</td>
                    <td className="files-td-size">{formatSize(f.file_size)}</td>
                    <td className="files-td-date">{formatDate(f.created_at)}</td>
                    <td className="files-td-action">
                      <a
                        className="files-download-link"
                        href={`/api/chat/file/${f.id}`}
                        download={f.file_name}
                        title="Download"
                      >
                        {"\u2B07"}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="files-pagination">
              <button
                className="files-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {"\u2190"} Prev
              </button>
              <span className="files-page-info">Page {page} of {totalPages}</span>
              <button
                className="files-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next {"\u2192"}
              </button>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
