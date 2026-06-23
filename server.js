import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { WebSocketServer } from "ws";
import * as acp from "@agentclientprotocol/sdk";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = Number(process.env.PORT || 3847);
const PI_CWD = process.env.PI_CWD || process.cwd();
const PI_ACP_COMMAND = process.env.PI_ACP_COMMAND || "npx";
const PI_ACP_ARGS = process.env.PI_ACP_ARGS
	? process.env.PI_ACP_ARGS.split(" ")
	: ["-y", "pi-acp"];
const PI_ACP_SHELL = process.env.PI_ACP_SHELL === "1" || (process.env.PI_ACP_SHELL !== "0" && process.platform === "win32");

const execFileAsync = promisify(execFile);

const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};

function sendJson(ws, payload) {
	if (ws.readyState === ws.OPEN) {
		ws.send(JSON.stringify(payload));
	}
}

function looksLikeToolId(value) {
	if (typeof value !== "string" || !value) return false;
	return /^tool_[0-9a-f-]+$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function prettifyToolName(name) {
	if (typeof name !== "string" || !name) return undefined;
	const trimmed = name.trim();
	if (!trimmed || looksLikeToolId(trimmed)) return undefined;

	const withoutMcp = trimmed.replace(/^mcp_(?:pi_)?/i, "");
	const aliases = {
		ffgrep: "grep",
		fffind: "find",
		bash: "shell",
	};
	return aliases[withoutMcp] ?? withoutMcp;
}

function toolNameFromRawOutput(rawOutput) {
	if (rawOutput == null) return undefined;
	if (typeof rawOutput === "object" && rawOutput !== null) {
		if ("toolName" in rawOutput) return prettifyToolName(rawOutput.toolName);
		if ("name" in rawOutput) return prettifyToolName(rawOutput.name);
	}
	if (typeof rawOutput === "string") {
		try {
			const parsed = JSON.parse(rawOutput);
			if (parsed && typeof parsed === "object") {
				return toolNameFromRawOutput(parsed);
			}
		} catch {
			// ignore invalid JSON
		}
	}
	return undefined;
}

function toolNameFromRawInput(rawInput) {
	if (rawInput == null) return undefined;
	if (typeof rawInput === "object" && rawInput !== null) {
		if ("toolName" in rawInput) return prettifyToolName(rawInput.toolName);
		if ("name" in rawInput) return prettifyToolName(rawInput.name);
	}
	if (typeof rawInput === "string") {
		try {
			const parsed = JSON.parse(rawInput);
			if (parsed && typeof parsed === "object") {
				return toolNameFromRawInput(parsed);
			}
		} catch {
			// ignore invalid JSON
		}
	}
	return undefined;
}

function resolveToolName(update) {
	const candidates = [
		update.title,
		toolNameFromRawOutput(update.rawOutput),
		toolNameFromRawInput(update.rawInput),
		update.kind,
	];
	for (const candidate of candidates) {
		const name = prettifyToolName(candidate);
		if (name) return name;
	}
	return undefined;
}

function createToolCallTracker() {
	const states = new Map();

	return {
		reset() {
			states.clear();
		},
		merge(update) {
			const id = update.toolCallId;
			if (!id) return { id: undefined, name: undefined };

			const state = states.get(id) ?? {
				title: undefined,
				rawInput: undefined,
				rawOutput: undefined,
				kind: undefined,
			};

			if (update.title) state.title = update.title;
			if (update.rawInput != null) state.rawInput = update.rawInput;
			if (update.rawOutput != null) state.rawOutput = update.rawOutput;
			if (update.kind) state.kind = update.kind;

			states.set(id, state);

			return {
				id,
				name: resolveToolName(state),
				state,
			};
		},
	};
}

function isStartupInfo(text) {
	return typeof text === "string" && text.includes("## Skills") && text.includes("## Extensions");
}

function spawnPiAcp() {
	const child = spawn(PI_ACP_COMMAND, PI_ACP_ARGS, {
		cwd: PI_CWD,
		stdio: ["pipe", "pipe", "pipe"],
		env: process.env,
		shell: PI_ACP_SHELL,
	});

	child.stderr?.on("data", (chunk) => {
		process.stderr.write(`[pi-acp] ${chunk}`);
	});

	child.on("error", (error) => {
		console.error("[pi-acp] failed to start:", error.message);
	});

	return child;
}

function createAcpClient(piSession) {
	const app = acp
		.client({ name: "pi-web" })
		.onRequest(acp.methods.client.session.requestPermission, (ctx) => {
			const preferred =
				ctx.params.options.find((option) => option.kind === "allow_once") ??
				ctx.params.options.find((option) => option.kind === "allow") ??
				ctx.params.options[0];

			sendJson(piSession.ws, {
				type: "permission",
				tool: ctx.params.toolCall.title,
				choice: preferred?.name ?? "auto",
			});

			return {
				outcome: {
					outcome: "selected",
					optionId: preferred.optionId,
				},
			};
		})
		.onRequest(acp.methods.client.fs.readTextFile, async (ctx) => {
			const content = await readFile(ctx.params.path, "utf8");
			return { content };
		})
		.onRequest(acp.methods.client.fs.writeTextFile, async (ctx) => {
			await writeFile(ctx.params.path, ctx.params.content, "utf8");
			return {};
		})
		.onNotification(acp.methods.client.session.update, (ctx) => {
			if (piSession.replayHandler) {
				piSession.replayHandler(ctx.params);
			}
		});

	return app;
}

const MAX_WIRE_CHARS = 2000;

function truncateWire(value, max = MAX_WIRE_CHARS) {
	if (value == null) return value;
	if (typeof value === "string") {
		return value.length > max ? `${value.slice(0, max)}…` : value;
	}
	if (typeof value === "object") {
		try {
			const text = JSON.stringify(value);
			if (text.length <= max) return value;
			return { truncated: true, preview: `${text.slice(0, max)}…` };
		} catch {
			return value;
		}
	}
	return value;
}

function sendModelsFromConfigOptions(ws, configOptions) {
	if (!Array.isArray(configOptions)) return;

	const modelOption = configOptions.find((option) => option.category === "model" || option.id === "model");
	if (!modelOption || modelOption.type !== "select" || !Array.isArray(modelOption.options)) return;

	sendJson(ws, {
		type: "models",
		current: modelOption.currentValue ?? null,
		models: modelOption.options.map((option) => ({
			id: option.value,
			name: option.name,
			description: option.description ?? null,
		})),
	});
}

function sendCommands(ws, commands) {
	if (!Array.isArray(commands)) return;
	sendJson(ws, {
		type: "commands",
		commands: commands.map((command) => ({
			name: command.name,
			description: command.description ?? "",
			hint: command.input?.hint ?? null,
		})),
	});
}

function forwardSessionUpdate(update, ws, { slimTools = false, toolTracker = null } = {}) {
	switch (update.sessionUpdate) {
		case "user_message_chunk":
			if (update.content?.type === "text" && update.content.text) {
				sendJson(ws, { type: "user_chunk", text: update.content.text });
			}
			break;
		case "agent_message_chunk":
			if (update.content?.type === "text" && update.content.text) {
				if (isStartupInfo(update.content.text)) break;
				sendJson(ws, { type: "chunk", text: update.content.text });
			}
			break;
		case "agent_thought_chunk":
			if (update.content?.type === "text" && update.content.text) {
				sendJson(ws, { type: "thought", text: update.content.text });
			}
			break;
		case "tool_call":
		case "tool_call_update": {
			const merged = toolTracker?.merge(update) ?? {
				id: update.toolCallId,
				name: resolveToolName(update),
			};
			const payload = {
				type: "tool",
				event: update.sessionUpdate === "tool_call" ? "start" : "update",
				id: merged.id ?? update.toolCallId,
				status: update.status,
				kind: update.kind,
			};

			if (merged.name) {
				payload.title = merged.name;
				payload.toolName = merged.name;
			}

			if (!slimTools) {
				if (update.rawInput != null) payload.rawInput = truncateWire(update.rawInput);
				if (update.rawOutput != null) payload.rawOutput = truncateWire(update.rawOutput);
			}

			sendJson(ws, payload);
			break;
		}
		case "plan":
			sendJson(ws, {
				type: "plan",
				entries: update.entries ?? [],
			});
			break;
		case "available_commands_update":
			sendCommands(ws, update.availableCommands);
			break;
		case "config_option_update":
			sendModelsFromConfigOptions(ws, update.configOptions);
			break;
		default:
			break;
	}
}

async function gitBranch(cwd) {
	try {
		const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
		return stdout.trim() || "master";
	} catch {
		return "master";
	}
}

async function gitBranches(cwd) {
	try {
		const { stdout } = await execFileAsync("git", ["branch", "--format=%(refname:short)"], { cwd });
		const branches = stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		return branches.length ? branches : ["master"];
	} catch {
		return ["master"];
	}
}

async function serveGitInfo(req, res) {
	try {
		const branch = await gitBranch(PI_CWD);
		const branches = await gitBranches(PI_CWD);
		const project = basename(PI_CWD);
		res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ project, branch, branches }));
	} catch {
		res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ project: basename(PI_CWD), branch: "master", branches: ["master"] }));
	}
}

async function serveStatic(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	let pathname = decodeURIComponent(url.pathname);
	if (pathname === "/") pathname = "/index.html";

	if (pathname === "/api/git") {
		await serveGitInfo(req, res);
		return;
	}

	if (pathname === "/marked.min.js") {
		const markedPath = join(__dirname, "node_modules", "marked", "marked.min.js");
		try {
			const body = await readFile(markedPath);
			res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
			res.end(body);
			return;
		} catch {
			res.writeHead(404).end("Not found");
			return;
		}
	}

	const filePath = join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));
	if (!filePath.startsWith(PUBLIC_DIR)) {
		res.writeHead(403).end("Forbidden");
		return;
	}

	try {
		const body = await readFile(filePath);
		res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404).end("Not found");
	}
}

class PiSession {
	constructor(ws) {
		this.ws = ws;
		this.busy = false;
		this.closed = false;
		this.agentProcess = null;
		this.connection = null;
		this.ctx = null;
		this.session = null;
		this.pumpPromise = null;
		this.replayHandler = null;
		this.protocolVersion = null;
		this.toolTracker = createToolCallTracker();
	}

	async start() {
		sendJson(this.ws, { type: "status", state: "connecting", cwd: PI_CWD });

		this.agentProcess = spawnPiAcp();
		const input = Writable.toWeb(this.agentProcess.stdin);
		const output = Readable.toWeb(this.agentProcess.stdout);
		const stream = acp.ndJsonStream(input, output);

		const app = createAcpClient(this);
		this.connection = app.connect(stream);
		this.ctx = this.connection.agent;

		try {
			const init = await this.ctx.request(acp.methods.agent.initialize, {
				protocolVersion: acp.PROTOCOL_VERSION,
				clientCapabilities: {
					fs: {
						readTextFile: true,
						writeTextFile: true,
					},
				},
			});
			this.protocolVersion = init.protocolVersion;

			const listResponse = await this.ctx.request(acp.methods.agent.session.list, {
				cwd: PI_CWD,
			});
			const sessions = listResponse.sessions ?? [];
			sendJson(this.ws, { type: "sessions", sessions });

			// Stay on the dashboard until the user opens an existing session or starts a new one.
			this.sendReady();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "status", state: "error", message });
			throw error;
		}
	}

	sendReady() {
		sendJson(this.ws, {
			type: "status",
			state: "ready",
			sessionId: this.session?.sessionId,
			protocolVersion: this.protocolVersion,
			cwd: PI_CWD,
		});
	}

	async disposeActiveSession() {
		if (!this.session) return;

		const oldSession = this.session;
		this.session = null;
		oldSession.dispose();

		await this.pumpPromise?.catch(() => {});
		this.pumpPromise = null;
	}

	async loadSession(sessionId, { replay = true } = {}) {
		await this.disposeActiveSession();

		sendJson(this.ws, { type: "clear" });
		this.toolTracker.reset();

		if (replay) {
			sendJson(this.ws, { type: "status", state: "loading_history" });
			this.replayHandler = (params) => {
				forwardSessionUpdate(params.update, this.ws, { toolTracker: this.toolTracker });
			};
		}

		try {
			const loadResponse = await this.ctx.request(acp.methods.agent.session.load, {
				sessionId,
				cwd: PI_CWD,
				mcpServers: [],
			});
			sendModelsFromConfigOptions(this.ws, loadResponse.configOptions);
		} finally {
			this.replayHandler = null;
		}

		this.session = this.ctx.attachSession({ sessionId });
		this.pumpPromise = this.pumpUpdates();

		sendJson(this.ws, { type: "session", sessionId });
		await this.refreshSessions();
	}

	async createSession() {
		await this.disposeActiveSession();
		sendJson(this.ws, { type: "clear" });
		this.toolTracker.reset();
		this.session = await this.ctx.buildSession(PI_CWD).start();
		sendModelsFromConfigOptions(this.ws, this.session.newSessionResponse.configOptions);
		this.pumpPromise = this.pumpUpdates();
		sendJson(this.ws, { type: "session", sessionId: this.session.sessionId });
		await this.refreshSessions();
	}

	async refreshSessions() {
		try {
			const listResponse = await this.ctx.request(acp.methods.agent.session.list, {
				cwd: PI_CWD,
			});
			sendJson(this.ws, { type: "sessions", sessions: listResponse.sessions ?? [] });
		} catch {
			// ignore list errors during refresh
		}
	}

	async switchSession(sessionId) {
		if (!sessionId) {
			sendJson(this.ws, { type: "error", message: "sessionId is required" });
			return;
		}
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message" });
			return;
		}

		try {
			await this.loadSession(sessionId);
			this.sendReady();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
		}
	}

	async newSession() {
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message" });
			return;
		}

		try {
			await this.createSession();
			this.sendReady();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
		}
	}

	async pumpUpdates() {
		const activeSession = this.session;
		while (!this.closed && this.session === activeSession && activeSession) {
			try {
				const message = await activeSession.nextUpdate();
				if (message.kind === "session_update") {
					forwardSessionUpdate(message.update, this.ws, { toolTracker: this.toolTracker });
				} else if (message.kind === "stop") {
					this.busy = false;
					sendJson(this.ws, {
						type: "done",
						stopReason: message.stopReason,
					});
				}
			} catch (error) {
				if (this.closed || this.session !== activeSession) break;
				const msg = error instanceof Error ? error.message : String(error);
				sendJson(this.ws, { type: "error", message: msg });
				break;
			}
		}
	}

	async handlePrompt(text, images = []) {
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message" });
			return;
		}

		if (!this.session) {
			try {
				await this.createSession();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				sendJson(this.ws, { type: "error", message });
				return;
			}
		}

		const trimmed = (text ?? "").trim();
		const imageBlocks = Array.isArray(images)
			? images.filter((image) => image?.data && image?.mimeType)
			: [];

		if (!trimmed && imageBlocks.length === 0) return;

		this.busy = true;
		sendJson(this.ws, { type: "status", state: "busy" });

		try {
			const prompt =
				imageBlocks.length === 0
					? trimmed
					: [
							...(trimmed ? [{ type: "text", text: trimmed }] : []),
							...imageBlocks.map((image) => ({
								type: "image",
								mimeType: image.mimeType,
								data: image.data,
							})),
						];

			await this.session.prompt(prompt);
			void this.refreshSessions();
		} catch (error) {
			this.busy = false;
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
			sendJson(this.ws, { type: "status", state: "ready" });
		}
	}

	async setModel(value) {
		if (!this.session) {
			sendJson(this.ws, { type: "error", message: "Session not ready" });
			return;
		}
		if (!value) {
			sendJson(this.ws, { type: "error", message: "Model value is required" });
			return;
		}

		try {
			const response = await this.ctx.request(acp.methods.agent.session.setConfigOption, {
				sessionId: this.session.sessionId,
				configId: "model",
				value,
			});
			sendModelsFromConfigOptions(this.ws, response.configOptions);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
		}
	}

	async cancel() {
		if (!this.connection || !this.session) return;
		try {
			await this.connection.agent.notify(acp.methods.agent.session.cancel, {
				sessionId: this.session.sessionId,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
		}
	}

	async close() {
		this.closed = true;
		this.replayHandler = null;

		if (this.session) {
			this.session.dispose();
			this.session = null;
		}

		if (this.connection) {
			this.connection.close();
		}

		if (this.agentProcess && !this.agentProcess.killed) {
			this.agentProcess.kill();
		}

		await this.pumpPromise?.catch(() => {});
	}
}

async function handleWebSocket(ws) {
	const pi = new PiSession(ws);

	try {
		await pi.start();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[pi-web] failed to start pi-acp:", message);
		sendJson(ws, { type: "status", state: "error", message });
		ws.close();
		return;
	}

	ws.on("message", async (raw) => {
		let msg;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			sendJson(ws, { type: "error", message: "Invalid JSON message" });
			return;
		}

		if (msg.type === "prompt") {
			await pi.handlePrompt(msg.text ?? "", msg.images ?? []);
		} else if (msg.type === "cancel") {
			await pi.cancel();
		} else if (msg.type === "switch_session") {
			await pi.switchSession(msg.sessionId);
		} else if (msg.type === "new_session") {
			await pi.newSession();
		} else if (msg.type === "set_model") {
			await pi.setModel(msg.value);
		}
	});

	ws.on("close", () => {
		void pi.close();
	});
}

const server = createServer(serveStatic);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
	void handleWebSocket(ws);
});

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(`Port ${PORT} is already in use (another pi-web instance may be running).`);
		console.error(`Stop it or use a different port: PORT=3848 npm start`);
	} else {
		console.error(err);
	}
	process.exit(1);
});

server.listen(PORT, () => {
	console.log(`pi-web listening on http://localhost:${PORT}`);
	console.log(`project cwd: ${PI_CWD}`);
	console.log(`pi-acp: ${PI_ACP_COMMAND} ${PI_ACP_ARGS.join(" ")}`);
});
