import { escapeHtmlSimple } from "@/frontend/lib/escapeHtml";
import type { Session } from "@/frontend/types";

interface SessionViewProps {
  session: Session;
  isActive: boolean;
  isHovered: boolean;
  isConfirmingDelete: boolean;
  onSessionClick: () => void;
  onRenameStart: () => void;
  onDeleteStart: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

/**
 * Renders a single session item: name with edit/delete action buttons,
 * or an inline delete confirmation when the user is about to delete.
 */
export default function SessionView({
  session,
  isActive,
  isHovered,
  isConfirmingDelete,
  onSessionClick,
  onRenameStart,
  onDeleteStart,
  onDeleteConfirm,
  onDeleteCancel,
}: SessionViewProps) {
  const name = session.name || "Chat";

  // ── Delete confirmation mode ──
  if (isConfirmingDelete) {
    return (
      <div className="sidebar-item-delete-confirm">
        <span className="sidebar-item-name">Delete "{escapeHtmlSimple(name)}"?</span>
        <span className="sidebar-rename-btns">
          <button
            className="sidebar-confirm-yes"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteConfirm();
            }}
          >
            ✓
          </button>
          <button
            className="sidebar-confirm-no"
            title="Cancel"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCancel();
            }}
          >
            ✗
          </button>
        </span>
      </div>
    );
  }

  // ── Normal display mode ──
  return (
    <>
      <span className="sidebar-item-name" data-id={session.id}>
        {escapeHtmlSimple(name)}
      </span>

      {/* Edit (rename) button — visible on hover */}
      <button
        className={`sidebar-item-edit sidebar-item-action ${isHovered ? "show" : ""}`}
        data-id={session.id}
        title="Rename"
        style={{
          display: isHovered ? "" : "none",
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 11,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onRenameStart();
        }}
      >
        ✎
      </button>

      {/* Delete button — visible on hover */}
      <button
        className={`sidebar-item-delete sidebar-item-action ${isHovered ? "show" : ""}`}
        data-id={session.id}
        title="Delete"
        style={{
          display: isHovered ? "" : "none",
          background: "none",
          border: "none",
          color: "var(--danger)",
          cursor: "pointer",
          fontSize: 11,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onDeleteStart();
        }}
      >
        🗑
      </button>
    </>
  );
}
