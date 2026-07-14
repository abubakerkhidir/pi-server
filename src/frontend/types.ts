// ====== API Types ======

export interface AuthResponse {
  token: string;
  username: string;
}

export interface Session {
  id: string;
  name: string | null;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}





export interface ModelInfo {
  id: string;
  name: string;
  input?: string[];
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

export interface ModelGroup {
  provider: string;
  models: ModelInfo[];
}

export interface ModelsResponse {
  groups: ModelGroup[];
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
  model_id?: string;
  home_dir?: string;
  tools_enabled?: string[];
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
  args: Record<string, unknown> | undefined;
  partialResult: unknown | undefined;
  result: unknown | undefined;
  isError: boolean;
  isComplete: boolean;
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

export type AgentReplyEntity = MsgData | ToolData | ThinkData;

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
}

export interface SessionTokenStats {
  total_prompt: number;
  total_think: number;
  total_output: number;
  total_text: number;
  context_used_pct: number;
  context_size: number;
  context_used?: number;  // actual context tokens used (from pi SDK)
  context_percent?: number;  // percentage of context used (from pi SDK)
  ttft_avg_ms: number;
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
}

export interface ChatState {
  records: ChatRecord[];
  sessionStats?: SessionTokenStats;
}

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
  thinking_lines: number;
  tool_lines: number;
  model_id?: string;
  home_dir?: string;
  tools_enabled?: string[];
};



// ====== React Component Props ======

export interface AuthFormProps {
  onAuthenticated: (username: string) => void;
}

export interface ChatLayoutProps {
  onLogout: () => void;
}



export interface ToolBlockProps {
  entity: ToolData;
  userSettings: { tool_lines: number; thinking_lines: number };
}

export interface ThinkingBlockProps {
  entity: ThinkData;
  userSettings: { tool_lines: number; thinking_lines: number };
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
