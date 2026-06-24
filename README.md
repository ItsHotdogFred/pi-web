# pi-web

Barebones browser UI for the [Pi coding agent](https://github.com/earendil-works/pi) via [ACP](https://agentclientprotocol.com) and [pi-acp](https://github.com/svkozak/pi-acp).

No React, no build step for the frontend — just static HTML/CSS/JS and a small Node bridge that spawns `pi-acp` and relays streaming updates over WebSocket.

## Architecture

```
Browser (static UI)  <--WebSocket-->  Node bridge (server.js)  <--stdio ACP-->  pi-acp  -->  pi --mode rpc
```

- The browser talks to your local machine only (same host WebSocket).
- `pi-acp` is started per browser tab/connection.
- Tool permissions are auto-approved for the prototype.

## Prerequisites

- Node.js 22+
- `pi` installed and configured (`npm install -g @earendil-works/pi-coding-agent`)
- API keys / model providers configured for Pi as usual

## Install

```bash
npm install
```

## Run

From the project directory you want Pi to work in:

```bash
npm start
```

Then open [http://localhost:3847](http://localhost:3847).

### Options

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3847` | HTTP + WebSocket port |
| `PI_CWD` | current directory | Working directory passed to `session/new` |
| `PI_ACP_COMMAND` | `node` | Command used to launch pi-acp |
| `PI_ACP_ARGS` | bundled `pi-acp` entry | Args for pi-acp (space-separated string) |
| `PI_ACP_SHELL` | `1` when command is `npx` on Windows | Use a shell when spawning pi-acp |
| `PI_ACP_ENABLE_EXTENSION_COMMANDS` | `1` | Include Pi extension slash commands such as `/tldr` |

Examples:

```bash
# Run against a specific repo
PI_CWD=/path/to/my/project npm start

# Use a globally installed pi-acp
PI_ACP_COMMAND=pi-acp PI_ACP_ARGS= npm start

# Disable extension slash commands if an extension UI command misbehaves in the browser
PI_ACP_ENABLE_EXTENSION_COMMANDS=0 npm start
```

## WebSocket protocol

Client → server:

```json
{ "type": "prompt", "text": "Explain this repo" }
{ "type": "cancel" }
{ "type": "switch_session", "sessionId": "..." }
{ "type": "new_session" }
{ "type": "set_model", "value": "..." }
{ "type": "set_cwd", "path": "/absolute/path/to/project" }
```

Server → client (subset):

```json
{ "type": "sessions", "sessions": [{ "sessionId": "...", "title": "...", "updatedAt": "..." }] }
{ "type": "status", "state": "ready", "sessionId": "...", "cwd": "..." }
{ "type": "project", "path": "/absolute/path", "project": "my-app", "branch": "master", "branches": ["master"] }
{ "type": "chunk", "text": "Hello" }
{ "type": "tool", "event": "start", "title": "read", "toolName": "read", "status": "pending" }
{ "type": "done", "stopReason": "end_turn" }
{ "type": "error", "message": "..." }
```

## Development

```bash
npm run dev
```

Uses Node's `--watch` flag to restart the bridge on file changes.

## Notes

- Session sidebar lists Pi sessions for the current project; switch or start new chats from the UI.
- Click the project name in the header to switch folders (recent paths + manual path entry).
- New Agent uses a precached empty session for near-instant startup; the last two sessions are preloaded in the background.
- Tool permissions are auto-approved for the prototype.

## License

MIT
