# pi-web

https://github.com/user-attachments/assets/cf3af33d-ee4e-444e-8052-be527ea0a263

> Pi in the browser. Same agent, fewer terminal tabs.

You know the drill. Pi is in the terminal. You're in the browser — docs, GitHub, Stack Overflow, the thing you were actually trying to read. You alt-tab back, scroll through tool output, lose the thread, alt-tab again. The agent works. Your attention doesn't.

pi-web puts Pi where your eyes already are.

---

## Before / after

You want to fix a bug in a repo you cloned yesterday. The terminal is buried under three other windows.

**Without pi-web:** Find the terminal. Remember which session had that conversation. Scroll. Copy a path. Paste it into a new prompt. Hope you picked the right `cwd`.

**With pi-web:**

```
Open http://localhost:3847
Click the project chip → pick the folder
Type: "the login redirect is broken on Safari — find it"
```

Pi reads the code, runs the tools, streams the answer. You never leave the tab.

---

## Just works

The CLI gets the job done until you need to do normal things.

Paste a stack trace — line wraps and scrollback get in the way. Share a screenshot — save it, type a path, hope Pi finds it. Read a long reply — scroll monospace walls of text and copy by hand.

pi-web is the boring fix: paste what you have, drop images into the composer, read rendered markdown, grab a code block in one selection. Same agent underneath. The parts that never felt right in a terminal just work the way you'd expect.

---

## What you get

No React. No Vite. No `npm run build` before you can type a prompt.

```
Browser (public/)  ←WebSocket→  server.js → src/  ←stdio ACP→  pi-acp  →  Pi
```

| | |
|---|---|
| **Dashboard** | Home composer, prompt activity heatmap, recent activity feed, generative session art (aurora / identicon / flow — click a card to cycle) |
| **Sidebar** | Search and quick-open recent agents for the current project |
| **Chat** | Streaming markdown, thinking blocks, tool cards with live status, agent plan blocks, subagent cards (parallel / chain / single) |
| **Prompt history** | Sidebar list of your prompts; click to scroll, fork from any turn to start a new session |
| **Sessions** | List, switch, and resume Pi sessions for the current project |
| **Projects** | Switch folders from the header; recents stored in localStorage |
| **Project notes** | Per-project scratchpad at `.pi-web/note.md` (Ctrl/Cmd+Shift+N) |
| **Models** | Searchable picker synced with Pi's configured providers |
| **Commands** | `/` palette for Pi slash commands and extensions |
| **File references** | Type `@` or click the file button to insert `@path` or `@folder/` into your prompt |
| **Context dial** | Token usage and breakdown (system, skills, project context, conversation), plus a one-click compact action |
| **Attachments** | Drop or attach images in the composer |
| **Code blocks** | Copy button on assistant fenced code blocks |
| **File context** | Collapsible list of files touched in the current session, open-in-editor links (VS Code, Cursor, Zed), and a diff review modal for all changes |
| **Permissions** | Approve or deny tool calls in a modal; previews show shell commands and edit/write diffs before you allow |
| **Tab status** | Browser title and favicon reflect working, done, permission needed, and error states |
| **Notifications** | Optional browser alerts when Pi finishes a turn while the tab is in the background |

Everything runs locally. The browser talks to your machine only. One pi-acp process per tab.

### Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Open command palette (when the composer isn't focused) |
| Ctrl/Cmd+Shift+N | Open project note |
| Ctrl/Cmd+Shift+R | Reconnect WebSocket |
| Ctrl+Shift+G | Cycle session card art style on the dashboard |
| Esc | Close command palette |

---

## Install

The most effort pi-web will ever ask of you:

### Prerequisites

- Node.js 22+
- [Pi](https://github.com/earendil-works/pi) installed and configured (`npm install -g @earendil-works/pi-coding-agent`)
- API keys / model providers set up the same way you'd use Pi in the terminal

### Run

```bash
git clone https://github.com/ItsHotdogFred/pi-web.git
cd pi-web
npm install
npm start
```

Open [http://localhost:3847](http://localhost:3847).

### Global command (Windows / macOS / Linux)

Install once from the pi-web directory:

```bash
npm install -g .
```

Then from any project folder:

```bash
cd C:\path\to\your\project
piweb
```

That starts pi-web with the folder you ran the command in as the default project. Same env vars as `npm start` (`PORT`, `PI_CWD`, etc.) still apply.

CLI options:

```bash
piweb --help          # usage, composer tips (@ files, / commands)
piweb --version       # installed version
piweb --port 3848     # different port
piweb --host 0.0.0.0  # bind address (LAN access)
piweb --cwd /path     # default project folder
```

After pulling updates, reinstall the global command so it picks up new UI and server changes:

```bash
cd pi-web
npm install -g .
```

To aim Pi at a specific repo on startup:

```bash
# macOS / Linux
PI_CWD=/path/to/your/project npm start

# Windows (PowerShell)
$env:PI_CWD="C:\path\to\your\project"; npm start
```

That was it.

---

## Configuration

| Variable | Default | What it does |
|----------|---------|--------------|
| `HOST` | `127.0.0.1` | Bind address (`HOST=0.0.0.0` for LAN access) |
| `PORT` | `3847` | HTTP + WebSocket port |
| `MAX_PROMPT_BYTES` | `10485760` (10 MB) | Max WebSocket message / image payload size |
| `PI_CWD` | current directory | Default project folder |
| `PI_ACP_COMMAND` | Node binary running the server | Command that launches pi-acp |
| `PI_ACP_ARGS` | bundled pi-acp entry | Arguments (space-separated) |
| `PI_ACP_SHELL` | `1` on Windows when using `npx` | Spawn pi-acp through a shell |
| `PI_ACP_ENABLE_EXTENSION_COMMANDS` | `1` | Expose extension slash commands like `/tldr` |
| `PI_WEB_AUTO_APPROVE` | off | Auto-approve tool permissions without a modal |

Examples:

```bash
# Listen on all interfaces for LAN access
HOST=0.0.0.0 npm start

# Different port (another pi-web already running)
PORT=3848 npm start

# Global pi-acp binary
PI_ACP_COMMAND=pi-acp PI_ACP_ARGS= npm start

# Extension command misbehaving in the browser UI
PI_ACP_ENABLE_EXTENSION_COMMANDS=0 npm start

# Skip the permission modal (local dev only)
PI_WEB_AUTO_APPROVE=1 npm start
```

---

## How it works

1. You open the page. `server.js` boots the HTTP server in `src/`, serves static files from `public/`, and accepts a WebSocket on `/ws`.
2. On connect, the server spawns `pi-acp` and speaks [ACP](https://agentclientprotocol.com) over stdio.
3. pi-acp drives Pi in RPC mode — same tools, same skills, same sessions as the CLI.
4. Streaming updates (text, tools, thoughts, usage) get normalized and pushed to the browser as JSON.
5. Session history loads from Pi's on-disk JSONL when possible (fast path) or replays through ACP (fallback).

**Lazy where it helps:** a new session is precached in the background so "New Agent" feels instant. Recent sessions preload from disk before you click them. Models and slash commands are fetched in a hidden probe session so the dashboard is ready before your first prompt. Fork-from-prompt copies Pi's on-disk JSONL up to a chosen user turn — no ACP replay required.

**Safe by default:** tool permissions open a modal in the browser. Approve once, always allow, or deny. Set `PI_WEB_AUTO_APPROVE=1` only for trusted local use. Don't expose pi-web to the internet and walk away.

**Patched dependency:** `npm install` applies a small `patch-package` patch to bundled `pi-acp` for turn lifecycle and extension-command behavior.

---

## Development

```bash
npm run dev          # restart server on file changes (node --watch)
npm run test:smoke   # run smoke tests (node:test + jsdom)
```

Frontend edits are plain static ES modules — refresh the browser.

```
server.js              entry point
src/                   Node server (HTTP, WebSocket, ACP bridge)
  server/              HTTP + WebSocket setup
  ws/                  per-tab Pi session lifecycle
  acp/                 pi-acp process + ACP client
  http/                REST helpers
  sessions/            session file index + fork-from-prompt
  analytics/           context + contribution stats
public/                static UI
  app.js               bootstraps modules under public/js/
  js/                  dashboard, chat, composer, wire protocol, etc.
  styles/              modular CSS (base, layout, chat, modals, …)
patches/               pi-acp patches applied on npm install
test/smoke/            smoke tests
```

Local profiling scripts (optional, not part of the runtime):

```bash
node bench-startup.mjs         # Pi RPC startup timings
node bench-extensions.mjs      # per-extension load cost
node bench-piweb.mjs           # end-to-end session switch benchmark
node bench-switch-session.mjs  # session switch perf (server-side)
```

---

## HTTP API

Read-only helpers for the dashboard UI. All accept an optional `cwd` query param.

| Endpoint | Returns |
|----------|---------|
| `GET /health` | `{ ok: true }` health check |
| `GET /api/git?cwd=...` | Project path, repo name, current branch, branch list |
| `GET /api/contributions?cwd=...&refresh=1` | Prompt activity heatmap data from local session history |
| `GET /api/files?cwd=...` | Project-relative file and folder paths for `@` reference picker |
| `GET /api/note?cwd=...` | Project note content (`.pi-web/note.md`) |
| `PUT /api/note?cwd=...` | Save project note — body: `{ "content": "..." }` |
| `POST /api/session/fork` | Fork a session from a prompt — body: `{ "cwd", "sourceSessionId", "promptIndex" }` → `{ sessionId, title, cwd }` |

---

## WebSocket protocol

For integrations, scripts, or your own UI.

Client → server:

```json
{ "type": "prompt", "text": "Explain this repo" }
{ "type": "prompt", "text": "What's wrong here?", "images": [{ "mimeType": "image/png", "data": "<base64>" }] }
{ "type": "cancel" }
{ "type": "compact", "instructions": "optional custom compact instructions" }
{ "type": "switch_session", "sessionId": "...", "requestId": "optional-correlation-id" }
{ "type": "new_session" }
{ "type": "set_model", "value": "claude-sonnet-4-20250514" }
{ "type": "set_cwd", "path": "/absolute/path/to/project" }
{ "type": "permission_response", "requestId": "...", "optionId": "...", "cancelled": false }
{ "type": "fetch_defaults" }
```

Server → client (subset):

```json
{ "type": "sessions", "sessions": [{ "sessionId": "...", "title": "...", "updatedAt": "..." }] }
{ "type": "session", "sessionId": "...", "title": "...", "cwd": "..." }
{ "type": "status", "state": "ready", "sessionId": "...", "cwd": "..." }
{ "type": "status", "state": "loading_history" }
{ "type": "status", "state": "busy" }
{ "type": "project", "path": "/abs/path", "project": "my-app", "branch": "main", "branches": ["main"] }
{ "type": "models", "current": "...", "models": [{ "id": "...", "name": "..." }] }
{ "type": "commands", "commands": [{ "name": "/compact", "description": "..." }] }
{ "type": "history", "events": [{ "type": "chunk", "text": "..." }] }
{ "type": "clear" }
{ "type": "chunk", "text": "Hello" }
{ "type": "thought", "text": "Let me check the router..." }
{ "type": "user_chunk", "text": "Earlier user message" }
{ "type": "tool", "event": "start", "title": "read", "toolName": "read", "status": "pending" }
{ "type": "plan", "entries": [{ "title": "...", "status": "pending" }] }
{ "type": "context", "used": 42000, "size": 128000, "percent": 32.8, "breakdown": [...] }
{ "type": "permission_request", "requestId": "...", "tool": { "title": "bash" }, "options": [{ "optionId": "...", "name": "Allow once" }] }
{ "type": "permission", "tool": "bash", "choice": "Allow once" }
{ "type": "done", "stopReason": "end_turn" }
{ "type": "error", "message": "..." }
```

---

## FAQ

**Is this an official Pi product?**
No. Community bridge. Pi lives in [earendil-works/pi](https://github.com/earendil-works/pi); this repo is a thin web shell over [pi-acp](https://github.com/svkozak/pi-acp) and [ACP](https://agentclientprotocol.com).

**Why not just use the terminal?**
You can. pi-web is for when the terminal isn't where you're looking — or when you want session thumbnails, a context dial, and a dashboard without building a frontend first.

**Why no React?**
Because the point is to open a tab and go. Static files, one WebSocket, done.

**Can I run this on a remote server?**
Technically yes; practically don't, unless you add auth and keep tool permissions gated. pi-web trusts whoever can open the port.

**Does it replace Cursor / Claude Code / Codex?**
Different job. Those are full IDE integrations. pi-web is Pi — your skills, your extensions, your sessions — in a browser window you already have open.

**The context dial says 90%. Now what?**
Click **Compact now** in the dial popover, start a new session for the next task, or run `/compact` from the command palette. The dial tells you before the model starts forgetting, not after.

**Why does pi-web ask before running tools?**
So you can see what Pi is about to do before it touches your filesystem or shell — including the exact command or diff for shell and edit/write tools. Set `PI_WEB_AUTO_APPROVE=1` if you want the old hands-off behavior on a trusted machine.

**How do I branch from an earlier prompt?**
Open the prompt in chat, then click the fork icon next to that turn in the History sidebar. pi-web copies the session JSONL up to that prompt into a new agent.

---

## Related

- [Pi coding agent](https://github.com/earendil-works/pi)
- [pi-acp](https://github.com/svkozak/pi-acp) — ACP adapter for Pi
- [Agent Client Protocol](https://agentclientprotocol.com)

---

## License

MIT. The shortest license that works.
