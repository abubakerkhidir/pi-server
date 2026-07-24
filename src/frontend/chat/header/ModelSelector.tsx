import { changeSessionModel } from "@/frontend/api";
import { useEffect, useRef, useState } from "react";

import type { BackendSession, ModelInfo, ModelProvider, UserSettings } from "@/frontend/types";

interface ModelSelectorProps {currentModel?: string; onModelSelect: (model: ModelInfo) => void; disabled?: boolean; userSettings: UserSettings, sessionId?:string,  currentSession?: BackendSession}

export default function ModelSelector({currentModel, onModelSelect, disabled = false,userSettings, sessionId,currentSession}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<ModelProvider | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const providerList = userSettings.providers||[]

  //set model on page load (after setting providers are loaded)
  useEffect(() => {
    if(userSettings.providers?.length && !currentModel){
      onModelSelect(findModel(userSettings,{id:userSettings.model,provider:userSettings.provider}))
    }
  },[userSettings?.providers])

  //set the model on session-resume (using session meta-data)
  useEffect(() => {
    if(currentSession?.id && currentSession?.llm_model && currentSession?.llm_provider){
      onModelSelect(findModel(userSettings,{id:currentSession?.llm_model,provider:currentSession?.llm_provider}))
    }
  },[currentSession?.id])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node) && !((e.target as HTMLElement)?.closest(".model-selector"))) {
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
    if (disabled) return;
    setOpen(true);
  };

  const handleModelSelect = async (model: ModelInfo) => {
    if (disabled) return;
    try{
      console.log('change model: ',sessionId, model)
      if(sessionId){
        const mr = await changeSessionModel(sessionId,model.provider,model.id)
      }
      onModelSelect(model);
      setOpen(false);
      setSelectedProvider(null);
    }catch(err){
      console.log('error saving model: ',model,err)
    }
  };

  return (
    <div className="model-selector" ref={dropdownRef} onClick={handleClick} style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      <span className="model-current">{currentModel|| "Select a model"}</span>
      <span className="model-arrow">▾</span>

      {open && !disabled && (
        <div className="model-dropdown" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, marginTop: 4 }} >
          {selectedProvider ? (
            <>
              <div
                style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6, }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                onMouseLeave={(e) =>(e.currentTarget.style.background = "")}
                onClick={() => setSelectedProvider(null)}
              >
                ← Back to providers
              </div>
              <div style={{padding: "4px 10px", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase"}}>
                {selectedProvider.provider}
              </div>
              {selectedProvider.models.map((m) => (
                <div
                  key={m.id}
                  style={{padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6}}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  onClick={() => handleModelSelect(m)}
                >
                  {m.name}
                </div>
              ))}
            </>
          ) : (
            providerList.length === 0 ? (<div style={{ padding: 8, color: "var(--text-dim)" }}>No models</div>) : (
              providerList.map((g) => (
                <div key={g.provider} style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6, }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                  onMouseLeave={(e) =>(e.currentTarget.style.background = "")}
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

function findModel(userSettings: UserSettings, model:{id?:string,provider?:string}):ModelInfo{
  const m = userSettings.providers?.flatMap(p=>p.models).find(x=>x.id===model.id && x.provider===model.provider)
  return m?? userSettings.providers?.flatMap(p=>p.models).find(x=>true)??{id:'1',provider:'1',name:'test'}
}