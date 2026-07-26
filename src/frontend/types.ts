// ====== API Types ======

export interface AuthResponse {
  token: string;
  username: string;
}

export interface Session {
  id: string;
  name: string | null;
  created_at?: string;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}





export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  input?: string[];
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  thinkLevels?:string[]
}

export interface ModelGroup {
  provider: string;
  models: ModelInfo[];
}

export interface ModelsResponse {
  groups: ModelGroup[];
}

export interface SamplingParams {
  temperature?: number | null;
  top_p?: number | null;
  top_k?: number | null;
}

export interface Settings {
  send_on_enter?: boolean;
  copy_text_as_plain?: boolean;
  enable_continue?: boolean;
  parse_pdf_as_image?: boolean;
  confirm_title_change?: boolean;
  first_line_title?: boolean;
  llm_title?: boolean;
  system_message?: string;
  paste_to_file_length?: number;
  max_image_resolution?: number;
  thinking_lines?: number;
  tool_lines?: number;
  tools_enabled?: string[];
  model_id?: string;
  home_dir?: string;
  think_level?: string;
  providers?:ModelProvider[];
  sampling_temperature?: number | null;
  sampling_top_p?: number | null;
  sampling_top_k?: number | null;
}

export interface ToolGroup {
  name: string;
  tools: { name: string; description: string }[];
}

export interface ToolsResponse {
  groups: ToolGroup[];
}

export interface StreamEvent {
  event: string;
  data: Record<string, unknown>;
}

// ====== Entity Types (stream entities) ======

export interface MsgData {
  type: "msg";
  id: string;
  content: string; // raw markdown text
  sealed?: boolean; // true when thinking is sealed before this msg
}

export interface ToolData {
  type: "tool";
  id: string; // from agent (tool_call_id)
  name: string;
  args?: any;
  partialResult?: unknown ;
  result?: unknown;
  isError?: boolean;
  isComplete?: boolean;
  sealed?: boolean;
  duration?: number; // seconds
}

export interface ThinkData {
  type: "think";
  id: string; // locally generated
  content: string;
  sealed?: boolean;
  duration?: number; // seconds
  totalLength?: number; // characters
}

export interface CompactData {
  type: "compact";
  id: string;
  summary?: string;
  tokensBefore?: number;
  tokensAfter?: number;
  savedPct?: number;
  startedAt?: number;
  duration?: number; // milliseconds
  sealed?: boolean;
  failed?: boolean;
}

export interface TurnData {
  type: "turn";
  id: string;
  turn: number;
  prompt_tokens: number;
  output_tokens: number;
  think_tokens: number;
  cache_read: number;
  cache_write: number;
  ttft_ms: number | null;
  duration_ms: number | null;
  prompt_per_sec?: number;
  output_per_sec?: number;
  prompt_ms?: number;
  predicted_ms?: number;
  predicted_per_second?: number;
  predicted_per_token_ms?: number;
  draft_n?: number;
  draft_n_accepted?: number;
  stop_reason?: string;
  tool_calls_count?: number;
  sealed?: boolean;
}

export type AgentReplyEntity = MsgData | ToolData | ThinkData | CompactData | TurnData;

export interface UserMsg {
  content: string;
  files?: string[];
}

export interface TokenStats {
  prompt_tokens: number;
  think_tokens: number;
  output_tokens: number;
  prompt_token_s: number;
  output_token_s: number;
  ttft_ms: number;

  total_prompt: number;
  total_think: number;
  total_output: number;
  total_text: number;
  context_used_pct: number;
  context_size: number;
  context_used?: number;  // actual context tokens used (from pi SDK)
  context_percent?: number;  // percentage of context used (from pi SDK)
  ttft_avg_ms: number;
  sessionTotals?:SessionTokenStats
}

export interface SessionTokenStats {
  total_input: number;
  total_cache_read: number;
  total_cache_write: number;
  total_reasoning: number;
  total_output: number;
  total_cost: number;
  context_size: number;
  context_used?: number;  // actual context tokens used (from pi SDK)
  context_percent?: number;  // percentage of context used (from pi SDK)
}

export interface AgentReply {
  id: string;
  entities: AgentReplyEntity[];
  tokenStats?: TokenStats;
}

export interface ChatRecord {
  id: string;
  userMsg: UserMsg;
  agentReply: AgentReply;
  created_at?: string;
}

export interface ChatState {
  records: ChatRecord[];
  sessionStats?: SessionTokenStats;
}

export interface ModelsApiRes { groups: ModelProvider[]; }

export interface ModelProvider {provider: string; models: ModelInfo[];}

export type UserSettings = {
  send_on_enter?: boolean;
  copy_text_as_plain?: boolean;
  enable_continue?: boolean;
  parse_pdf_as_image?: boolean;
  confirm_title_change?: boolean;
  first_line_title?: boolean;
  llm_title?: boolean;
  system_message?: string;
  paste_to_file_length?: number;
  max_image_resolution?: number;
  thinking_lines?: number;
  tool_lines?: number;
  tools_enabled?: string[];
  home_dir?: string;
  provider?: string;
  model?: string;
  think_level?: string; 
  providers?:ModelProvider[];
  sampling_temperature?: number | null;
  sampling_top_p?: number | null;
  sampling_top_k?: number | null;
};



// ====== React Component Props ======

export interface AuthFormProps {
  onAuthenticated: (username: string) => void;
}

export interface ChatLayoutProps {
  onLogout: () => void;
  onShowFiles: () => void;
}



export interface ToolBlockProps {
  entity: ToolData;
  userSettings: { tool_lines?: number; thinking_lines?: number };
  content?:any
  sealed?:boolean
}

export interface ThinkingBlockProps {
  id: string;
  content: string;
  sealed?: boolean;
  duration?: number;
  totalLength?: number;
  userSettings: { tool_lines?: number; thinking_lines?: number };
}

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: Partial<Settings>) => void;
  onResumeSession: (sessionId: string | null) => void;
  onSettingsChange: (settings: UserSettings) => void;
}

export interface SidebarProps {
  sessions: Session[];
  sessionTotal: number;
  currentSessionId: string | null;
  onNewChat: () => void;
  onSessionClick: (sessionId: string) => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggle: () => void;
  onRenameComplete?: () => void;
  onLoadMore: () => void;
}

export interface InputAreaProps {
  onSend: (prompt: string, files: File[]) => void;
  onStop?: () => void;
  disabled: boolean;
  value: string;
  onValueChange: (value: string) => void;
  uploadedFiles: File[];
  onAddFile?: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
}

export interface BackendSession { id: string; created_at?: string; updated_at?: string; llm_provider?: string; llm_model?: string; think_level?: string; user_id: string;
  pi_session_id?: string; name?: string; pi_session_file?: string; home_dir?: string; context_size?: number; context_used?: number; context_percent?: number;
  total_input?: number; total_output?: number; total_cache_read?: number; total_cache_write?: number; total_reasoning?: number; total_cost?: number;
  sampling_temperature?: number | null; sampling_top_p?: number | null; sampling_top_k?: number | null;
}

export interface BackendHistory {
  sessionId: string; name: string; meta: BackendSession; records: BackendRecord[]; sessionStats?: SessionTokenStats;
}
export interface BackendEntity {
  type: "think" | "msg" | "tool" | "compact" | "turn";
  content?: string; name?: string; args?: Record<string, unknown>; result?: unknown;
  isError?: boolean; isComplete?: boolean; duration?: number; totalLength?: number;
  summary?: string; tokensBefore?: number; tokensAfter?: number;
  savedPct?: number; failed?: boolean;
  // Turn-specific fields
  turn?: number; prompt_tokens?: number; output_tokens?: number; think_tokens?: number;
  cache_read?: number; cache_write?: number; ttft_ms?: number | null; duration_ms?: number | null;
  prompt_per_sec?: number; output_per_sec?: number; prompt_ms?: number;
  predicted_ms?: number; predicted_per_second?: number; predicted_per_token_ms?: number;
  draft_n?: number; draft_n_accepted?: number; stop_reason?: string; tool_calls_count?: number;
}

export interface BackendRecord {
  id: string; userMsg: { content: string }; agentReply: { id: string; entities: BackendEntity[]; tokenStats?: TokenStats;}; created_at?: string;
}