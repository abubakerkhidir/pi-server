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





export interface ModelGroup {
  provider: string;
  models: { id: string; name: string }[];
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
  sealed?:boolean
}

export interface ThinkData {
  type: "think";
  id: string; // locally generated
  content: string;
  sealed?:boolean
}

export type AgentReplyEntity = MsgData | ToolData | ThinkData;

export interface UserMsg {
  content: string;
  files?: string[];
}

export interface AgentReply {
  id: string;
  entities: AgentReplyEntity[];
}

export interface ChatRecord {
  id: string;
  userMsg: UserMsg;
  agentReply: AgentReply;
}

export interface ChatState {
  records: ChatRecord[];
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
  currentSessionId: string | null;
  onNewChat: () => void;
  onSessionClick: (sessionId: string) => void;
  onLogout: () => void;
  collapsed: boolean;
  onToggle: () => void;
  onRenameComplete?: () => void;
}

export interface InputAreaProps {
  onSend: (prompt: string, files: File[]) => void;
  disabled: boolean;
  value: string;
  onValueChange: (value: string) => void;
  uploadedFiles: File[];
  onRemoveFile: (index: number) => void;
}
