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

export async function register(username: string, password: string): Promise<Record<string, unknown>> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Registration failed");
  return data;
}

export async function login(username: string, password: string): Promise<Record<string, unknown>> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data;
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/settings");
  return res.json();
}

export async function updateSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getTools(): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/tools");
  return res.json();
}

export async function getSessions(): Promise<unknown[]> {
  const res = await apiFetch("/api/sessions");
  return res.json();
}

export async function deleteSession(id: string): Promise<void> {
  await apiFetch(`/api/sessions/${id}`, { method: "DELETE" });
}

export async function renameSession(id: string, name: string): Promise<void> {
  await apiFetch(`/api/sessions/${id}/name`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function getModels(): Promise<Record<string, unknown>> {
  const res = await apiFetch("/api/models");
  return res.json();
}

export async function getChatHistory(sessionId: string): Promise<unknown> {
  const res = await apiFetch(`/api/chat/history/${sessionId}`);
  return res.json();
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
