# pi-web

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

## Stories

These are the sessions pi-web is built for. Names changed; the workflows aren't.

### The midnight handoff

Maya ships a feature at 11pm and opens a fresh agent: *"Add a migration for the new `teams` table and wire it into the signup flow."* She watches the tool cards tick by — `read`, `edit`, `bash` — then closes the laptop.

Next morning she opens pi-web, clicks yesterday's session in the activity feed (aurora thumbnail, same as she left it), and types: *"Run the migration and fix whatever tests broke."* Same session, same context, no archaeology in `~/.pi/agent/sessions`.

### The screenshot bug

Leo gets a Slack message with a screenshot of a broken layout. He drops the image into the composer, adds *"this breaks below 768px — fix the header"*, and sends. Pi sees the image, greps the CSS, patches the flex rules. The file-context panel lists every path Pi touched; Leo clicks through without asking *"which files did you change?"*

### The context check

An hour into a refactor, the context dial turns amber. Priya hovers it:

| Part | Tokens |
|------|-------:|
| System prompt | 612 |
| Skills | 4,180 |
| Project context | 2,940 |
| Conversation | 38,200 |

She starts a new session for the next sub-task before Pi starts forgetting the beginning of the thread. The dial is a fuel gauge, not a surprise bill.

### The wrong repo

Devin meant to work on `api-gateway` but pi-web opened on `pi-web` because that's where he ran `npm start`. He clicks the project name, picks `api-gateway` from recents, and the sidebar repopulates with that repo's sessions. One UI, many projects — no second server instance.

---

## What you get

No React. No Vite. No `npm run build` before you can type a prompt.

```
Browser (HTML/CSS/JS)  ←WebSocket→  server.js  ←stdio ACP→  pi-acp  →  pi
```

| | |
|---|---|
| **Dashboard** | Home composer, recent sessions, generative session art (aurora / identicon / flow — click a card to cycle) |
| **Chat** | Streaming markdown, thinking blocks, tool cards with live status |
| **Sessions** | List, switch, and resume Pi sessions for the current project |
| **Projects** | Switch folders from the header; recents stored in localStorage |
| **Models** | Searchable picker synced with Pi's configured providers |
| **Commands** | `/` palette for Pi slash commands and extensions |
| **Context dial** | Token usage and breakdown (system, skills, project context, conversation) |
| **Attachments** | Drop or attach images in the composer |
| **File context** | Collapsible list of files touched in the current session |

Everything runs locally. The browser talks to your machine only. One pi-acp process per tab.

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

To aim Pi at a specific repo on startup:

```bash
PI_CWD=/path/to/your/project npm start
```

That was it.

---

## Configuration

| Variable | Default | What it does |
|----------|---------|--------------|
| `PORT` | `3847` | HTTP + WebSocket port |
| `PI_CWD` | current directory | Default project folder |
| `PI_ACP_COMMAND` | `node` | Command that launches pi-acp |
| `PI_ACP_ARGS` | bundled pi-acp entry | Arguments (space-separated) |
| `PI_ACP_SHELL` | `1` on Windows when using `npx` | Spawn pi-acp through a shell |
| `PI_ACP_ENABLE_EXTENSION_COMMANDS` | `1` | Expose extension slash commands like `/tldr` |

Examples:

```bash
# Different port (another pi-web already running)
PORT=3848 npm start

# Global pi-acp binary
PI_ACP_COMMAND=pi-acp PI_ACP_ARGS= npm start

# Extension command misbehaving in the browser UI
PI_ACP_ENABLE_EXTENSION_COMMANDS=0 npm start
```

---

## How it works

1. You open the page. `server.js` serves static files and accepts a WebSocket on `/ws`.
2. On connect, the server spawns `pi-acp` and speaks [ACP](https://agentclientprotocol.com) over stdio.
3. pi-acp drives Pi in RPC mode — same tools, same skills, same sessions as the CLI.
4. Streaming updates (text, tools, thoughts, usage) get normalized and pushed to the browser as JSON.
5. Session history can load from Pi's on-disk JSONL (fast path) or replay through ACP (fallback).

**Lazy where it helps:** a new session is precached in the background so "New Agent" feels instant. Recent sessions preload from disk before you click them.

**Lazy where it doesn't:** tool permissions are auto-approved in this prototype. Fine for local dev; don't expose pi-web to the internet and walk away.

---

## Development

```bash
npm run dev
```

Restarts the bridge on file changes (`node --watch`). Frontend edits are plain static files — refresh the browser.

Local profiling scripts (optional, not part of the runtime):

```bash
node bench-startup.mjs      # Pi RPC startup timings
node bench-extensions.mjs   # per-extension load cost
```

---

## WebSocket protocol

For integrations, scripts, or your own UI.

Client → server:

```json
{ "type": "prompt", "text": "Explain this repo" }
{ "type": "prompt", "text": "What's wrong here?", "images": [{ "mimeType": "image/png", "data": "<base64>" }] }
{ "type": "cancel" }
{ "type": "switch_session", "sessionId": "..." }
{ "type": "new_session" }
{ "type": "set_model", "value": "claude-sonnet-4-20250514" }
{ "type": "set_cwd", "path": "/absolute/path/to/project" }
```

Server → client (subset):

```json
{ "type": "sessions", "sessions": [{ "sessionId": "...", "title": "...", "updatedAt": "..." }] }
{ "type": "status", "state": "ready", "sessionId": "...", "cwd": "..." }
{ "type": "project", "path": "/abs/path", "project": "my-app", "branch": "main", "branches": ["main"] }
{ "type": "chunk", "text": "Hello" }
{ "type": "thought", "text": "Let me check the router..." }
{ "type": "tool", "event": "start", "title": "read", "toolName": "read", "status": "pending" }
{ "type": "context", "used": 42000, "size": 128000, "percent": 32.8, "breakdown": [...] }
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
Technically yes; practically don't, unless you add auth and stop auto-approving tool permissions. pi-web trusts whoever can open the port.

**Does it replace Cursor / Claude Code / Codex?**
Different job. Those are full IDE integrations. pi-web is Pi — your skills, your extensions, your sessions — in a browser window you already have open.

**The context dial says 90%. Now what?**
Start a new session for the next task, or let Pi compact. The dial tells you before the model starts forgetting, not after.

---

## Related

- [Pi coding agent](https://github.com/earendil-works/pi)
- [pi-acp](https://github.com/svkozak/pi-acp) — ACP adapter for Pi
- [Agent Client Protocol](https://agentclientprotocol.com)

---

## License

MIT. The shortest license that works.
