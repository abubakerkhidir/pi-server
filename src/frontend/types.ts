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

export interface ToolEntry {
  id: string;
  name: string;
  args: string;
  result: string;
  is_error?: boolean;
}

export interface SessionHistory {
  messages: ChatMessage[];
  tools: ToolEntry[];
  thinking: { content: string }[];
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

// ====== Chat Types ======

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

export interface StreamMessageState {
  flowDiv: HTMLDivElement;
  rawText: string;
  thinkingBlocks: Map<HTMLDivElement, { ctrl: unknown; sealed: boolean }>;
  toolIndicators: Map<string, HTMLDivElement>;
}

// ====== React Component Props ======

export interface AuthFormProps {
  onAuthenticated: (username: string) => void;
}

export interface ChatLayoutProps {
  onLogout: () => void;
}

export interface ChatMessageProps {
  message: ChatMessage;
  role: "user" | "assistant";
  isStreaming?: boolean;
  flowDiv?: HTMLDivElement;
}

export interface ToolBlockProps {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  maxLines?: number;
  isWrite?: boolean;
  onToolUpdate: (id: string, partialResult: unknown) => void;
  onToolEnd: (id: string, result: unknown, isError: boolean) => void;
  onToolRemove: (id: string) => void;
  isComplete?: boolean;
}

export interface ThinkingBlockProps {
  content: string;
  isStreaming?: boolean;
  maxLines?: number;
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
