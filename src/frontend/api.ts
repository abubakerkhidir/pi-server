const TOKEN_KEY = "pi_server_token";
const USERNAME_KEY = "pi_server_username";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setAuth(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

interface ApiFetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function apiFetchWithPrms(path: string, options: ApiFetchOptions = {}, ...prms:any) {
  let url = path
  if(prms){
    const params = new URLSearchParams();
    for (let i = 0; i < prms.length; i++) {
      if(prms[i])
        params.set(prms[i], prms[i+1]);
      i++;
    }
    url+= `?${params}`
    
  }
  const res = await apiFetch(url);
  const data= await res.json() 
  return {res,data}
}

async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    window.dispatchEvent(new CustomEvent("auth:logout"));
    throw new Error("Session expired");
  }

  if (!res.ok) {
    throw new Error(`API error (${res.status}): ${res.statusText}`);
  }

  return res;
}

async function apiCall<T>(method: "POST"|"PUT", path: string, body?: any) {
  const res = await apiFetch(path, {
    method: method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return {res,data};
}

async function apiPost<T>(path: string, body?: any) {return apiCall("POST",path,body)}

async function apiPut<T>(path: string, body: Record<string, unknown>) { return apiCall("PUT",path,body)}

export async function register(username: string, password: string): Promise<Record<string, unknown>> {
  return (await apiPost("/api/auth/register",{ username, password })).data;
}

export async function login(username: string, password: string): Promise<Record<string, unknown>> {
  return (await apiPost("/api/auth/login",{ username, password })).data;
}

export async function getSettings(): Promise<Record<string, unknown>> {
  return (await apiFetch("/api/settings")).json();
}

export async function updateSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
  return apiPut("/api/settings", settings);
}

export async function getTools(): Promise<Record<string, unknown>> {
  return (await apiFetch("/api/tools")).json();
}

export async function getSessions(limit?: number, offset?: number): Promise<{ sessions: unknown[]; total: number }> {
  return (await apiFetchWithPrms("/api/sessions",undefined,limit?"limit":undefined,limit,offset?"offset":undefined,offset)).data;
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/api/sessions/${id}`, { method: "DELETE" });
}

export async function searchSessions(q: string): Promise<{ sessions: unknown[]; total: number }> {
  return (await apiFetchWithPrms("/api/sessions/search",undefined,"q",q)).data;
}

export async function renameSession(id: string, name: string): Promise<void> {
  await apiPut(`/api/sessions/${id}/name`, { name });
}

export async function getModels(): Promise<Record<string, unknown>> {
  return (await apiFetch("/api/models")).json();
}

export async function summarizeSession(sessionId: string): Promise<{ summary: string }> {
  return (await apiPost(`/api/chat/session/${encodeURIComponent(sessionId)}/summarize`)).data;
}

export async function getChatHistory(sessionId: string): Promise<unknown> {
  return (await apiFetch(`/api/chat/history/${sessionId}`)).json();
}

export async function getCommands(sessionId: string | null): Promise<{ name: string; description: string; source: string }[]> {
  if (!sessionId) return [];
  return (await apiFetchWithPrms("/api/chat/commands",undefined,"sessionId",encodeURIComponent(sessionId))).data.commands ?? [];
}

export interface FileRecord {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  type: "upload" | "download";
  tool_name: string | null;
  created_at: string;
  session_name: string | null;
  session_id: string;
}

export interface FilesResponse {
  files: FileRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getFiles(page?: number, limit?: number, search?: string, type?: string): Promise<FilesResponse> {
  return (await apiFetchWithPrms("/api/files", undefined,
    page ? "page" : undefined, page,
    limit ? "limit" : undefined, limit,
    search ? "search" : undefined, search,
    type ? "type" : undefined, type
  )).data;
}

export async function getThinkingInfo(sessionId: string): Promise<{ current: string | null; available: string[] }> {
  return (await apiFetchWithPrms("/api/chat/thinking",undefined,"sessionId",encodeURIComponent(sessionId))).data;
}

export async function setThinkingLevel(sessionId: string, level: string): Promise<{ level: string }> {
  return (await apiPost("/api/chat/thinking", { sessionId, level })).data;
}

export type ChatStreamCallback = (event: string, data: Record<string, unknown>) => void;
export type ChatStreamErrorCallback = (err: Error) => void;
export type AbortChatStream = () => void;

export function createChatStream(
  sessionId: string | null,
  prompt: string,
  files: File[] | undefined,
  onEvent: ChatStreamCallback,
  onError: ChatStreamErrorCallback,
): AbortChatStream {
  const abortController = new AbortController();

  const formData = new FormData();
  formData.append("prompt", prompt);
  if (sessionId) formData.append("sessionId", sessionId);
  if (files) {
    for (const f of files) {
      formData.append("files", f);
    }
  }

  const token = getToken();

  fetch("/api/chat/stream", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    signal: abortController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        let msg = `Server error (${response.status})`;
        try {
          const j = JSON.parse(text);
          msg = j.error || msg;
        } catch {
          // ignore
        }
        onError(new Error(msg));
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              onEvent(currentEvent!, JSON.parse(data));
            } catch {
              // ignore parse errors
            }
            currentEvent = null;
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err);
      }
    });

  return () => abortController.abort();
}
