# ui-lama — Web Chat UI for pi-coding-agent

A full-stack web application providing a real-time chat interface for the **[pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)** AI coding agent. Users authenticate, chat with an AI agent, upload files/images, manage sessions, and configure models/tools — all through a responsive React SPA backed by Express + SQLite.

---

## Purpose

- **Human-in-the-loop coding**: Let users interact with an AI coding agent through a conversational UI.
- **Multi-user**: Register/login with JWT auth; each user gets isolated sessions and file workspace.
- **Real-time streaming**: Agent responses (text, thinking/reasoning, tool execution) stream live to the UI via Server-Sent Events / raw `fetch` stream.
- **File & media support**: Upload images, PDFs, and video frames as context for the agent.
- **Session management**: Create, rename, delete, and resume chat sessions.
- **Configurable**: Choose models, enable/disable tools, set system messages, and more.

---

## Tech Stack

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| **Frontend** | React 19 · TypeScript · Vite · plain CSS (no UI framework)                |
| **Backend**  | Express.js · Node.js (ES modules)                                          |
| **Database** | SQLite via `better-sqlite3` (WAL mode)                                     |
| **Auth**     | JWT tokens (`jsonwebtoken`) + bcrypt password hashing                       |
| **Upload**   | `multer` → `uploads/` directory (max 500 MB)                               |
| **AI Agent** | `@earendil-works/pi-coding-agent` (`@earendil-works/pi-coding-agent`)     |
| **Video**    | Custom frame extractor (`pi-video.js`) for video context                   |
| **Markdown** | `marked` for rendering agent output                                        |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Browser / Client                  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │  Auth     │  │  Chat    │  │  Settings /      │   │
│  │  Form     │  │  Layout  │  │  Config          │   │
│  └──────────┘  └──────────┘  └──────────────────┘   │
│       │              │                                │
│       └──────┬───────┘                                │
│              │ REST + Server-Sent Events (fetch)       │
└──────────────┼────────────────────────────────────────┘
               │
  ┌────────────┼────────────────────────────────────────┐
  │            ▼                                        │
  │  ┌─────────────────────────────┐                    │
  │  │   Express.js Server (:3500) │                    │
  │  │                             │                    │
  │  │  Routes:                    │                    │
  │  │  /api/auth/*    — register  │                    │
  │  │  /api/chat/*    — stream    │                    │
  │  │  /api/settings  — config    │                    │
  │  │  /api/sessions  — CRUD      │                    │
  │  │  /api/tools       — discover│                    │
  │  │  /api/models      — discover│                    │
  │  │                             │                    │
  │  │  Middleware:                │                    │
  │  │  JWT auth · Multer upload   │                    │
  │  │                             │                    │
  │  │  PiSessionManager           │                    │
  │  │  └─ wraps pi-coding-agent   │                    │
  │  └────┬────────────────────────┘                    │
  │       │                                             │
  │  ┌────▼─────────┐   ┌─────────────────────┐        │
  │  │ SQLite DB     │   │ uploads/            │        │
  │  │ (pi-server.db)│   │ (images, videos,    │        │
  │  └───────────────┘   │  PDFs, etc.)        │        │
  └─────────────────────┘   └─────────────────────┘
```

### Key Components

#### Backend (`src/backend/`)

| File                  | Role |
| --------------------- | ---- |
| `server.js`           | Express app entry point; mounts all routes, serves the React SPA, initializes DB & PiSessionManager |
| `db.js`               | SQLite setup (WAL mode), schema creation (users, sessions, messages, tools, thinking) |
| `auth.js`             | User registration & login routes (bcrypt + JWT) |
| `pi-session.js`       | `PiSessionManager` class — creates/disposes `pi-coding-agent` sessions, proxies prompts & event streams, caches tools, loads/saves per-user settings |
| `pi-video.js`         | Video frame extraction utility |
| `middleware/auth.js`  | JWT token generation & `authMiddleware` for Express routes |
| `middleware/upload.js`| Multer upload configuration |
| `routes/chat.js`      | Chat history retrieval & SSE streaming endpoint |
| `routes/sessions.js`  | Session CRUD (list, delete, rename) |
| `routes/settings.js`  | Settings get/update, tool discovery, model discovery |

#### Frontend (`src/frontend/`)

| Path                          | Role |
| ----------------------------- | ---- |
| `main.tsx`                    | React 18 entry point, loads all CSS modules |
| `App.tsx`                     | Root component — guards routes with auth check, switches between AuthForm and ChatLayout |
| `api.ts`                      | API client — JWT injection, SSE stream parser for chat, CRUD calls |
| `types.ts`                    | TypeScript interfaces for all API types & component props |
| `chat/window/ChatLayout.tsx`  | Main layout: sidebar, chat area, input bar, settings modal |
| `chat/body/ChatMessage.tsx`   | Renders individual chat messages |
| `chat/body/ThinkingBlock.tsx` | Collapsible thinking/reasoning blocks |
| `chat/body/ToolBlock.tsx`     | Collapsible tool execution display with progress |
| `chat/input/InputArea.tsx`    | Prompt input with file upload chips |
| `sidebar/ChatSidebar.tsx`     | Session list with rename, delete, new chat |
| `config/settings/SettingsModal.tsx` | Settings dialog (general, sessions, tools tabs) |
| `config/models/ModelSelector.tsx`   | Model provider selection |
| `hooks/useChatStream.ts`      | Manages SSE chat streaming logic |
| `hooks/useSessionHistory.ts`  | Loads & renders historical session messages |
| `lib/formatters/*`            | Text/markdown formatting utilities (file diffs, search results, system output) |

### Data Model

```
users ──< user_settings
users ──< session_metadata
session_metadata ──< chat_messages
session_metadata ──< thinking_entries
session_metadata ──< tool_entries
```

- **Users**: id, username, password_hash, home_dir (file workspace), created_at
- **Sessions**: id (UUID), user_id, pi_session_id, name, timestamps
- **Chat Messages**: session_id, role (user/assistant), content
- **Thinking Entries**: session_id, seq, content (agent reasoning)
- **Tool Entries**: session_id, seq, tool_call_id, name, args, result, partial_result, is_error

---

## Design Decisions

1. **Single DB per workspace** — SQLite in WAL mode for concurrency; one database at `.pi-server/pi-server.db`.
2. **Sessions per user** — Each session maps to a `pi-coding-agent` instance; sessions stay alive in memory (`PiSessionManager.activeSessions`) for the server lifecycle.
3. **SSE streaming** — Chat responses are pushed to the frontend as raw text chunks with typed events (`message_update`, `tool_execution_*`, `agent_end`), enabling live UI updates.
4. **Per-user workspaces** — Each user has a `users/<username>/` directory that the agent reads/writes files in, isolated from other users.
5. **No external DB** — Everything is local; no PostgreSQL/MySQL dependency.
6. **Static SPA serving** — After building React, Express serves `dist/` and falls back to `index.html` for client-side routing.
7. **Tool/model discovery** — Dynamically queried from the agent on each request (with tool caching at 5-minute TTL).

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the backend server
npm start          # runs on PORT env or defaults to 3500

# Start dev server (frontend hot-reload, proxies /api to backend)
npm run dev        # frontend at :3000, proxy to :3501
```

### Environment

| Variable | Default          | Description       |
| -------- | ---------------- | ----------------- |
| `PORT`   | `3500`           | Backend HTTP port |

---

## API Endpoints

| Method | Path                       | Auth | Description |
| ------ | -------------------------- | ---- | ----------- |
| POST   | `/api/auth/register`       | No   | Register a new user |
| POST   | `/api/auth/login`          | No   | Login, returns JWT |
| GET    | `/api/auth/me`             | Yes  | Get current user |
| GET    | `/api/sessions`            | Yes  | List user sessions |
| DELETE | `/api/sessions/:id`        | Yes  | Delete a session |
| PUT    | `/api/sessions/:id/name`   | Yes  | Rename a session |
| GET    | `/api/settings`            | Yes  | Get user settings |
| PUT    | `/api/settings`            | Yes  | Update user settings |
| GET    | `/api/tools`               | Yes  | Discover available tools |
| GET    | `/api/models`              | Yes  | Discover available models |
| POST   | `/api/chat/stream`         | Yes  | Send prompt, receive SSE stream |
| GET    | `/api/chat/history/:id`    | Yes  | Get chat history for a session |
| GET    | `/health`                  | No   | Health check |

---

## Project Structure

```
ui-lama/
├── src/
│   ├── backend/
│   │   ├── server.js          # Express app entry
│   │   ├── db.js              # SQLite initialization & schema
│   │   ├── auth.js            # Auth routes
│   │   ├── pi-session.js      # Agent session manager
│   │   ├── pi-video.js        # Video frame extraction
│   │   ├── middleware/
│   │   │   ├── auth.js        # JWT helpers
│   │   │   └── upload.js      # Multer config
│   │   └── routes/
│   │       ├── chat.js        # Chat & streaming
│   │       ├── sessions.js    # Session CRUD
│   │       └── settings.js    # Settings, tools, models
│   └── frontend/
│       ├── main.tsx           # React entry
│       ├── App.tsx            # Root component
│       ├── api.ts             # API client + SSE stream
│       ├── types.ts           # TypeScript types
│       ├── styles/            # CSS modules
│       ├── auth/
│       ├── chat/              # Chat components
│       ├── sidebar/           # Session sidebar
│       ├── config/            # Settings & model config
│       ├── hooks/             # React hooks
│       └── lib/               # Formatters & utils
├── dist/                      # Built SPA (production)
├── uploads/                   # Uploaded files
├── users/                     # Per-user agent workspaces
├── .pi-server/                # SQLite database
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

Total: ~4,800 lines of source code across ~55 files.

---

## Detailed File Structure

### Root & Config

| File | Lines | Description |
|------|------:|-------------|
| `./README.md` | 223 | This README |
| `./index.html` | 12 | SPA entry HTML — mounts React at `#root` |
| `./package.json` | 33 | NPM manifest — Express + React 19 + Vite + pi-coding-agent + SQLite deps |
| `./tsconfig.json` | 24 | TypeScript config — ES2020, JSX, `@/*` alias, `rootDir: ./src` |
| `./vite.config.ts` | 18 | Vite config — React plugin, `@/*` alias, proxy `/api` & `/uploads` → :3501 |

### Backend — Core

| File | Lines | Description |
|------|------:|-------------|
| `./src/backend/server.js` | 58 | Express app entry — mounts routes, serves `dist/` SPA, inits DB + PiSessionManager, handles SIGTERM cleanup |
| `./src/backend/db.js` | 105 | SQLite init (WAL mode) and schema creation — users, user_settings, session_metadata, chat_messages, thinking_entries, tool_entries |
| `./src/backend/pi-session.js` | 214 | `PiSessionManager` class — wraps pi-coding-agent, creates/disposes agent sessions, streams prompts & events, caches tools, loads/saves per-user settings |
| `./src/backend/pi-video.js` | 101 | Video frame extraction utility — decodes video, samples frames at configurable FPS with max resolution/frames |

### Backend — Auth

| File | Lines | Description |
|------|------:|-------------|
| `./src/backend/middleware/auth.js` | 27 | JWT helpers — `generateToken()` with 7d expiry, `authMiddleware()` that validates Bearer tokens |
| `./src/backend/middleware/upload.js` | 12 | Multer config — uploads to `uploads/` dir, 500 MB file size limit |
| `./src/backend/auth.js` | 74 | Auth routes — POST /register (bcrypt + default settings), POST /login, GET /me |

### Backend — Routes

| File | Lines | Description |
|------|------:|-------------|
| `./src/backend/routes/chat.js` | 210 | Chat routes — SSE streaming endpoint (POST /chat/stream) with file upload, chat history (GET /chat/history/:id), abort support |
| `./src/backend/routes/sessions.js` | 44 | Session CRUD — GET /sessions (list), DELETE /sessions/:id, PUT /sessions/:id/name |
| `./src/backend/routes/settings.js` | 155 | Settings routes — GET/PUT /settings (validated update), GET /tools (discovery with 5min cache), GET /models (provider grouping) |

### Frontend — Core

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/main.tsx` | 19 | React entry — creates root, imports all global + component CSS files |
| `./src/frontend/App.tsx` | 42 | Root component — checks auth on mount, switches between `AuthForm` and `ChatLayout`, listens for `auth:logout` events |
| `./src/frontend/api.ts` | 200 | API client — JWT storage (localStorage), `apiFetch()` with 401 auto-logout, SSE stream parser (event/data line splitting), all CRUD + chat stream functions |
| `./src/frontend/types.ts` | 164 | All TypeScript interfaces — AuthResponse, Session, ChatMessage, ToolEntry, SessionHistory, ModelGroup, Settings, StreamEvent, plus React component props |
| `./src/frontend/vite-env.d.ts` | 1 | Vite env type declaration (empty) |

### Frontend — Auth

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/auth/AuthForm.tsx` | 84 | Login/Register form with tab switching, validation, and token storage on success |

### Frontend — Chat Body

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/chat/body/ChatMessage.tsx` | 64 | Renders user or assistant messages with markdown formatting via `marked` |
| `./src/frontend/chat/body/ThinkingBlock.tsx` | 87 | Collapsible thinking/reasoning block with line limit and streaming indicator |
| `./src/frontend/chat/body/ToolBlock.tsx` | 176 | Tool execution display — collapsible, shows args/result, live partial updates, error highlighting, optional diff rendering |

### Frontend — Chat Input

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/chat/input/FileChips.tsx` | 39 | File upload preview chips with remove buttons |
| `./src/frontend/chat/input/InputArea.tsx` | 91 | Prompt input area with textarea, file upload button, send button, loading indicator |

### Frontend — Chat Window

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/chat/window/ChatHeader.tsx` | 27 | Header bar — username, current model display, settings button, logout button |
| `./src/frontend/chat/window/ChatLayout.tsx` | 71 | Main layout — coordinates sidebar, chat window, input, settings modal; manages sessions, settings, model state, and stream hooks |
| `./src/frontend/chat/window/ChatWindow.tsx` | 15 | Chat viewport container — holds welcome message and message list with scroll ref |

### Frontend — Config: Models

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/config/models/ModelSelector.tsx` | 156 | Model dropdown — groups models by provider, displays model name/thinking capability, calls `onModelSelect` |

### Frontend — Config: Settings

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/config/settings/SettingsModal.tsx` | 84 | Settings dialog — wraps GeneralTab, SessionsTab, ToolsTab with open/close/save lifecycle |
| `./src/frontend/config/settings/SettingsTabs/GeneralTab.tsx` | 122 | General settings tab — send_on_enter, copy_as_plain, continue, PDF/image options, system message, line limits, home_dir |
| `./src/frontend/config/settings/SettingsTabs/SessionsTab.tsx` | 74 | Sessions tab — auto-title options (first_line_title, llm_title), confirm_title_change |
| `./src/frontend/config/settings/SettingsTabs/ToolsTab.tsx` | 58 | Tools tab — checkboxes for enabling/disabling individual tools, grouped by source |

### Frontend — Hooks

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/hooks/useChatStream.ts` | 297 | Main stream hook — calls `createChatStream()`, processes SSE events to render text/thinking/tools, manages streaming state, auto-scroll, abort |
| `./src/frontend/hooks/useSessionHistory.ts` | 137 | Session history loader — fetches chat history, parses messages/thinking/tools, renders into DOM, handles session switching |

### Frontend — Lib

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/lib/escapeHtml.ts` | 53 | HTML escape utility for sanitizing user content |
| `./src/frontend/lib/formatters/index.ts` | 43 | Re-exports all formatter utilities |
| `./src/frontend/lib/formatters/file.ts` | 152 | File diff formatter — renders file reads/edits/writes with diff highlighting |
| `./src/frontend/lib/formatters/search.ts` | 88 | Search result formatter — renders grep/search output with path/context/highlight |
| `./src/frontend/lib/formatters/system.ts` | 76 | System output formatter — renders system-level agent output blocks |

### Frontend — Sidebar

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/sidebar/ChatSidebar.tsx` | 183 | Session sidebar — session list, new chat button, rename inline editing, delete with confirm, collapse/expand, logout |

### Frontend — Styles

| File | Lines | Description |
|------|------:|-------------|
| `./src/frontend/styles/global.css` | 39 | Global resets, CSS custom properties (colors, spacing), base typography |
| `./src/frontend/styles/responsive.css` | 12 | Media queries for mobile/tablet breakpoints |
| `./src/frontend/styles/settings.css` | 269 | Settings modal styles — tab layout, form fields, tool checkboxes, scrollable panels |
| `./src/frontend/styles/components/auth.css` | 113 | Auth form styles — card, tabs, input fields, buttons, error messages |
| `./src/frontend/styles/components/chat.css` | 132 | Chat message styles — user/assistant bubbles, markdown rendering, spacing, avatar |
| `./src/frontend/styles/components/diff.css` | 61 | Diff rendering styles — added/removed lines, side-by-side or inline diff display |
| `./src/frontend/styles/components/extracting.css` | 36 | Video extraction progress indicator styles |
| `./src/frontend/styles/components/header.css` | 107 | Chat header styles — layout, model selector dropdown, settings/logout buttons |
| `./src/frontend/styles/components/input.css` | 178 | Input area styles — textarea, file chips, send button, loading spinner |
| `./src/frontend/styles/components/model.css` | 102 | Model selector dropdown styles — provider grouping, model items, reasoning badge |
| `./src/frontend/styles/components/sidebar.css` | 217 | Sidebar styles — session list, collapse toggle, rename input, hover/active states, new chat button |
| `./src/frontend/styles/components/tools.css` | 180 | Tool block styles — collapse animation, error state, arg/result display, diff within tool output |

### User Data

| File | Lines | Description |
|------|------:|-------------|
| `./users/bob/README.md` | 194 | Bob's workspace README — auto-generated by pi-coding-agent documenting the workspace |

### Other

| File | Lines | Description |
|------|------:|-------------|
| `./server.js` | 316 | Root-level Express server — legacy/simplified entry (proxy to `src/backend/server.js`) |
| `./package-lock.json` | 5847 | Locked dependency tree |
