import { useRef, useState } from "react";

interface SessionEditProps {
  currentName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/**
 * Inline rename input for a single session.
 * Extracted from the original RenameInput component.
 */
export default function SessionEdit({ currentName, onSave, onCancel }: SessionEditProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(currentName);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        className="sidebar-rename-input"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave(value.trim() || currentName);
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
      <span className="sidebar-rename-btns">
        <button onClick={() => onSave(value.trim() || currentName)}>✓</button>
        <button onClick={onCancel}>✗</button>
      </span>
    </>
  );
}
