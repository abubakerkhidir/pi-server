import { useState, useEffect, useRef, useCallback } from "react";
import { getModels } from "@/frontend/api";

interface ModelSelectorProps {
  currentModel: string;
  onModelSelect: (model: { id: string; name: string }) => void;
}

export default function ModelSelector({
  currentModel,
  onModelSelect,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providerList, setProviderList] = useState<
    { provider: string; models: { id: string; name: string }[] }[]
  >([]);
  const [selectedProvider, setSelectedProvider] = useState<{
    provider: string;
    models: { id: string; name: string }[];
  } | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getModels()
      .then((r) => {
        setProviderList((r as { groups: typeof providerList }).groups || []);
      })
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;

    const close = (e: MouseEvent) => {
      if (
        !dropdownRef.current?.contains(e.target as Node) &&
        !((e.target as HTMLElement)?.closest(".model-selector"))
      ) {
        setOpen(false);
        setSelectedProvider(null);
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 10);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  };

  const handleModelSelect = (model: { id: string; name: string }) => {
    onModelSelect(model);
    setOpen(false);
    setSelectedProvider(null);
  };

  return (
    <div
      className="model-selector"
      ref={dropdownRef}
      onClick={handleClick}
    >
      <span className="model-current">{currentModel}</span>
      <span className="model-arrow">▾</span>

      {open && (
        <div
          className="model-dropdown"
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "100%", right: 0, marginTop: 4 }}
        >
          {selectedProvider ? (
            <>
              <div
                style={{
                  padding: "6px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                  borderRadius: 6,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--surface3)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "")
                }
                onClick={() => setSelectedProvider(null)}
              >
                ← Back to providers
              </div>
              <div
                style={{
                  padding: "4px 10px",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                {selectedProvider.provider}
              </div>
              {selectedProvider.models.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface3)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "")
                  }
                  onClick={() => handleModelSelect(m)}
                >
                  {m.name}
                </div>
              ))}
            </>
          ) : (
            providerList.length === 0 ? (
              <div style={{ padding: 8, color: "var(--text-dim)" }}>No models</div>
            ) : (
              providerList.map((g) => (
                <div
                  key={g.provider}
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--surface3)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "")
                  }
                  onClick={() => setSelectedProvider(g)}
                >
                  {g.provider} ({g.models.length})
                </div>
              ))
            )
          )}
        </div>
      )}
    </div>
  );
}
