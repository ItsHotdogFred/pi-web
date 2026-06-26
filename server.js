import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { join, extname, basename, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { access, readFile, stat, writeFile, readdir, open } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable, Writable } from "node:stream";
import { WebSocketServer } from "ws";
import * as acp from "@agentclientprotocol/sdk";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");
const PORT = Number(process.env.PORT || 3847);
const DEFAULT_CWD = process.env.PI_CWD || process.cwd();
const PI_ACP_ENTRY = join(__dirname, "node_modules", "pi-acp", "dist", "index.js");
const PI_ACP_COMMAND = process.env.PI_ACP_COMMAND || process.execPath;
const PI_ACP_ARGS = process.env.PI_ACP_ARGS
	? process.env.PI_ACP_ARGS.split(" ")
	: [PI_ACP_ENTRY];
const PI_ACP_SHELL =
	process.env.PI_ACP_SHELL === "1" ||
	(process.env.PI_ACP_SHELL !== "0" && process.platform === "win32" && PI_ACP_COMMAND === "npx");
const PI_WEB_AUTO_APPROVE = process.env.PI_WEB_AUTO_APPROVE === "1";
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

const PERMISSION_KIND_LABELS = {
	allow_once: "Allow once",
	allow_always: "Always allow",
	allow: "Allow",
	reject_once: "Deny",
	reject_always: "Always deny",
	reject: "Deny",
};

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

function couldBeStartupPartial(buffer) {
	if (buffer.includes("## Skills") && !buffer.includes("## Extensions")) return true;
	for (const marker of ["## Skills", "## Extensions"]) {
		for (let i = 1; i < marker.length; i++) {
			if (buffer.endsWith(marker.slice(0, i))) return true;
		}
	}
	return false;
}

function createStartupInfoFilter() {
	let buffer = "";
	let startupInfoSkipped = false;
	let bufferedChunks = 0;
	const maxStartupBufferChunks = 8;

	return {
		reset() {
			buffer = "";
			startupInfoSkipped = false;
			bufferedChunks = 0;
		},
		filter(text) {
			if (!text) return null;
			if (startupInfoSkipped) return text;
			buffer += text;
			bufferedChunks++;
			if (isStartupInfo(buffer)) {
				startupInfoSkipped = true;
				buffer = "";
				bufferedChunks = 0;
				return null;
			}
			if (buffer.includes("## Skills")) {
				startupInfoSkipped = true;
				buffer = "";
				bufferedChunks = 0;
				return null;
			}
			if (bufferedChunks >= maxStartupBufferChunks) {
				startupInfoSkipped = true;
				const out = buffer;
				buffer = "";
				bufferedChunks = 0;
				return out;
			}
			if (couldBeStartupPartial(buffer)) return null;
			const out = buffer;
			buffer = "";
			bufferedChunks = 0;
			return out;
		},
	};
}

function spawnPiAcp(cwd) {
	const child = spawn(PI_ACP_COMMAND, PI_ACP_ARGS, {
		cwd,
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			...process.env,
			PI_ACP_ENABLE_EXTENSION_COMMANDS: process.env.PI_ACP_ENABLE_EXTENSION_COMMANDS ?? "1",
		},
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

function permissionOptionLabel(option) {
	if (option?.kind && PERMISSION_KIND_LABELS[option.kind]) {
		return PERMISSION_KIND_LABELS[option.kind];
	}
	return option?.name ?? option?.kind ?? "Choose";
}

function createAcpClient(piSession) {
	const app = acp
		.client({ name: "pi-web" })
		.onRequest(acp.methods.client.session.requestPermission, (ctx) => {
			const preferred =
				ctx.params.options.find((option) => option.kind === "allow_once") ??
				ctx.params.options.find((option) => option.kind === "allow") ??
				ctx.params.options[0];

			if (PI_WEB_AUTO_APPROVE) {
				sendJson(piSession.ws, {
					type: "permission",
					tool: ctx.params.toolCall.title,
					choice: preferred?.name ?? "auto",
					optionId: preferred?.optionId,
				});

				return {
					outcome: {
						outcome: "selected",
						optionId: preferred.optionId,
					},
				};
			}

			const requestId = crypto.randomUUID();
			const tool = {
				title: ctx.params.toolCall.title,
				toolCallId: ctx.params.toolCall.toolCallId,
				kind: ctx.params.toolCall.kind,
				rawInput: truncateWire(ctx.params.toolCall.rawInput),
			};
			const options = ctx.params.options.map((option) => ({
				optionId: option.optionId,
				name: permissionOptionLabel(option),
				kind: option.kind,
			}));

			sendJson(piSession.ws, {
				type: "permission_request",
				requestId,
				tool,
				options,
			});

			return new Promise((resolve) => {
				const timeout = setTimeout(() => {
					piSession.pendingPermissions.delete(requestId);
					resolve({ outcome: { outcome: "cancelled" } });
				}, PERMISSION_TIMEOUT_MS);

				piSession.pendingPermissions.set(requestId, {
					resolve,
					timeout,
					tool,
					options: ctx.params.options,
				});
			});
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

function getPiAgentDir() {
	return process.env.PI_CODING_AGENT_DIR
		? resolve(process.env.PI_CODING_AGENT_DIR)
		: join(homedir(), ".pi", "agent");
}

const DEFAULT_CONTEXT_WINDOW = 128_000;
const CONTEXT_DIAL_RADIUS = 7;
const CONTEXT_DIAL_CIRCUMFERENCE = 2 * Math.PI * CONTEXT_DIAL_RADIUS;

let modelContextWindows = null;

function loadModelContextWindows() {
	if (modelContextWindows) return modelContextWindows;

	const windows = new Map();
	const agentDir = getPiAgentDir();
	const files = [
		join(agentDir, "models.json"),
		join(agentDir, "cursor-model-cache.json"),
	];

	for (const filePath of files) {
		try {
			const data = JSON.parse(readFileSync(filePath, "utf8"));
			if (Array.isArray(data)) {
				for (const model of data) {
					if (typeof model?.id === "string" && typeof model?.contextWindow === "number") {
						windows.set(model.id, model.contextWindow);
					}
				}
				continue;
			}
			for (const provider of Object.values(data?.providers ?? {})) {
				for (const model of provider?.models ?? []) {
					if (typeof model?.id === "string" && typeof model?.contextWindow === "number") {
						windows.set(model.id, model.contextWindow);
					}
				}
			}
		} catch {
			/* ignore missing or invalid model files */
		}
	}

	modelContextWindows = windows;
	return windows;
}

function resolveContextWindow(modelId) {
	if (!modelId) return DEFAULT_CONTEXT_WINDOW;
	return loadModelContextWindows().get(modelId) ?? DEFAULT_CONTEXT_WINDOW;
}

function calculateContextTokens(usage) {
	if (!usage || typeof usage !== "object") return 0;
	if (typeof usage.totalTokens === "number" && usage.totalTokens > 0) return usage.totalTokens;
	return (
		(usage.input ?? 0) +
		(usage.output ?? 0) +
		(usage.cacheRead ?? 0) +
		(usage.cacheWrite ?? 0)
	);
}

function estimateMessageTokensFallback(message) {
	if (!message) return 0;
	const parts = [];
	if (typeof message.content === "string") {
		parts.push(message.content);
	} else if (Array.isArray(message.content)) {
		for (const part of message.content) {
			if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
			else if (part?.type === "thinking" && typeof part.thinking === "string") parts.push(part.thinking);
			else if (part?.type === "toolCall") parts.push(JSON.stringify(part));
			else if (part?.type === "image") parts.push("".padEnd(4800, "x"));
			else parts.push(JSON.stringify(part));
		}
	} else if (message.content != null) {
		parts.push(JSON.stringify(message.content));
	}
	if (parts.length === 0) return 0;
	return Math.max(1, Math.ceil(parts.join("\n").length / 4));
}

function estimateTextTokens(text) {
	if (!text || typeof text !== "string") return 0;
	return Math.ceil(text.length / 4);
}

function findPiCodingAgentDir() {
	if (process.env.PI_CODING_AGENT_DIR) {
		const resolved = resolve(process.env.PI_CODING_AGENT_DIR);
		if (existsSync(join(resolved, "package.json"))) return resolved;
	}

	const candidates = [
		join(__dirname, "node_modules", "@earendil-works", "pi-coding-agent"),
		join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@earendil-works", "pi-coding-agent"),
		join(homedir(), ".local", "share", "npm", "node_modules", "@earendil-works", "pi-coding-agent"),
	];

	for (const dir of candidates) {
		if (existsSync(join(dir, "package.json"))) return dir;
	}

	return null;
}

let piPromptModulePromise = null;
let piEstimateTokensFn = null;

function loadPiPromptModule() {
	if (!piPromptModulePromise) {
		piPromptModulePromise = (async () => {
			const piDir = findPiCodingAgentDir();
			if (!piDir) return null;

			const [systemPrompt, resourceLoader, skills, tools, compaction] = await Promise.all([
				import(pathToFileURL(join(piDir, "dist/core/system-prompt.js")).href),
				import(pathToFileURL(join(piDir, "dist/core/resource-loader.js")).href),
				import(pathToFileURL(join(piDir, "dist/core/skills.js")).href),
				import(pathToFileURL(join(piDir, "dist/core/tools/index.js")).href),
				import(pathToFileURL(join(piDir, "dist/core/compaction/compaction.js")).href),
			]);

			piEstimateTokensFn = compaction.estimateTokens;

			return {
				buildSystemPrompt: systemPrompt.buildSystemPrompt,
				loadProjectContextFiles: resourceLoader.loadProjectContextFiles,
				loadSkills: skills.loadSkills,
				createAllToolDefinitions: tools.createAllToolDefinitions,
				estimateTokens: compaction.estimateTokens,
			};
		})().catch(() => null);
	}

	return piPromptModulePromise;
}

function estimateMessageTokens(message) {
	if (piEstimateTokensFn) return piEstimateTokensFn(message);
	return estimateMessageTokensFallback(message);
}

function readFirstExistingFile(paths) {
	for (const filePath of paths) {
		try {
			if (existsSync(filePath)) return readFileSync(filePath, "utf8");
		} catch {
			/* ignore */
		}
	}
	return null;
}

function estimateToolSchemaTokens(toolDef) {
	if (!toolDef) return 0;
	const parts = [toolDef.name, toolDef.description, toolDef.promptSnippet, JSON.stringify(toolDef.parameters ?? {})];
	return estimateTextTokens(parts.filter(Boolean).join("\n"));
}

function findDefaultSystemPromptSource() {
	const piDir = findPiCodingAgentDir();
	if (!piDir) return null;
	const filePath = join(piDir, "dist/core/system-prompt.js");
	return existsSync(filePath) ? filePath : null;
}

function formatPromptSourceHint(filePath) {
	if (!filePath) return undefined;
	const normalized = filePath.replace(/\\/g, "/");
	const marker = "@earendil-works/pi-coding-agent/";
	const idx = normalized.indexOf(marker);
	if (idx >= 0) return normalized.slice(idx + marker.length);
	return basename(filePath);
}

function discoverPromptFile(cwd, agentDir, filename) {
	const projectPath = join(cwd, ".pi", filename);
	if (existsSync(projectPath)) return projectPath;
	const globalPath = join(agentDir, filename);
	if (existsSync(globalPath)) return globalPath;
	return null;
}

function readPromptFile(filePath) {
	if (!filePath) return undefined;
	try {
		const raw = readFileSync(filePath, "utf8");
		return raw.trim() ? raw : undefined;
	} catch {
		return undefined;
	}
}

async function loadPiPromptInputs(cwd) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const agentDir = getPiAgentDir();
	const pi = await loadPiPromptModule();

	const systemPromptPath = discoverPromptFile(resolvedCwd, agentDir, "SYSTEM.md");
	const appendPromptPath = discoverPromptFile(resolvedCwd, agentDir, "APPEND_SYSTEM.md");
	const customPrompt = readPromptFile(systemPromptPath);
	const appendSystemPrompt = readPromptFile(appendPromptPath);

	let contextFiles = [];
	let skills = [];
	const activeTools = ["read", "bash", "edit", "write"];
	const toolSnippets = {};
	const promptGuidelines = [];

	if (pi) {
		contextFiles = pi.loadProjectContextFiles({ cwd: resolvedCwd, agentDir });
		const skillsResult = pi.loadSkills({
			cwd: resolvedCwd,
			agentDir,
			skillPaths: [],
			includeDefaults: true,
		});
		skills = skillsResult.skills ?? [];

		const toolDefs = pi.createAllToolDefinitions(resolvedCwd, {});
		for (const name of activeTools) {
			const def = toolDefs[name];
			if (def?.promptSnippet) toolSnippets[name] = def.promptSnippet;
			if (Array.isArray(def?.promptGuidelines)) promptGuidelines.push(...def.promptGuidelines);
		}
	} else {
		toolSnippets.read = "Read file contents";
		toolSnippets.bash = "Execute bash commands (ls, grep, find, etc.)";
		toolSnippets.edit =
			"Make precise file edits with exact text replacement, including multiple disjoint edits in one call";
		toolSnippets.write = "Create or overwrite files";
	}

	return {
		pi,
		resolvedCwd,
		customPrompt,
		appendSystemPrompt,
		systemPromptPath,
		appendPromptPath,
		contextFiles,
		skills,
		activeTools,
		toolSnippets,
		promptGuidelines,
	};
}

async function buildPiPromptBreakdown(cwd) {
	const inputs = await loadPiPromptInputs(cwd);
	const {
		pi,
		resolvedCwd,
		customPrompt,
		appendSystemPrompt,
		systemPromptPath,
		appendPromptPath,
		contextFiles,
		skills,
		activeTools,
		toolSnippets,
		promptGuidelines,
	} = inputs;

	if (!pi) {
		return {
			system: 0,
			tools: 0,
			skills: 0,
			extensions: estimateTextTokens(appendSystemPrompt),
			context: 0,
			systemLabel: customPrompt ? basename(systemPromptPath ?? "SYSTEM.md") : "Default system prompt",
			appendLabel: appendPromptPath ? basename(appendPromptPath) : "APPEND_SYSTEM.md",
			systemSource: customPrompt
				? formatPromptSourceHint(systemPromptPath)
				: formatPromptSourceHint(findDefaultSystemPromptSource()),
			appendSource: formatPromptSourceHint(appendPromptPath),
			hasCustomSystemPrompt: Boolean(customPrompt),
			hasAppendSystemPrompt: Boolean(appendSystemPrompt),
			mcp: 0,
		};
	}

	const shared = {
		cwd: resolvedCwd,
		customPrompt,
		selectedTools: activeTools,
		toolSnippets,
		promptGuidelines,
	};

	const bare = pi.buildSystemPrompt({ ...shared, contextFiles: [], skills: [] });
	const withAppend = pi.buildSystemPrompt({
		...shared,
		appendSystemPrompt,
		contextFiles: [],
		skills: [],
	});
	const withContext = pi.buildSystemPrompt({
		...shared,
		appendSystemPrompt,
		contextFiles,
		skills: [],
	});
	const withSkills = pi.buildSystemPrompt({
		...shared,
		appendSystemPrompt,
		contextFiles,
		skills,
	});

	let system = 0;
	let tools = 0;

	if (customPrompt) {
		system = estimateTextTokens(bare);
		const toolDefs = pi.createAllToolDefinitions(resolvedCwd, {});
		for (const name of activeTools) {
			tools += estimateToolSchemaTokens(toolDefs[name]);
		}
	} else {
		// Count the full Pi base prompt (intro, tool list, guidelines, pi docs, date/cwd).
		// Do not use splitDefaultPromptSections here — it drops the tools/guidelines block
		// from "system" and made the UI show ~361 tokens instead of ~600+.
		system = estimateTextTokens(bare);
		tools = 0;
	}

	return {
		system,
		tools,
		skills: Math.max(0, estimateTextTokens(withSkills) - estimateTextTokens(withContext)),
		extensions: Math.max(0, estimateTextTokens(withAppend) - estimateTextTokens(bare)),
		context: Math.max(0, estimateTextTokens(withContext) - estimateTextTokens(withAppend)),
		systemLabel: customPrompt
			? basename(systemPromptPath ?? "SYSTEM.md")
			: "Default system prompt",
		appendLabel: appendPromptPath ? basename(appendPromptPath) : "APPEND_SYSTEM.md",
		systemSource: customPrompt
			? formatPromptSourceHint(systemPromptPath)
			: formatPromptSourceHint(findDefaultSystemPromptSource()),
		appendSource: formatPromptSourceHint(appendPromptPath),
		hasCustomSystemPrompt: Boolean(customPrompt),
		hasAppendSystemPrompt: Boolean(appendSystemPrompt),
		mcp: 0,
	};
}

async function buildContextBreakdown(messages, cwd, totalUsed) {
	// Warm Pi modules so estimateMessageTokens uses the same heuristic as Pi CLI.
	await loadPiPromptModule();

	const promptParts = await buildPiPromptBreakdown(cwd);

	const staticParts = [
		{
			id: "system",
			label: promptParts.systemLabel,
			tokens: promptParts.system,
			source: promptParts.systemSource,
		},
		...(promptParts.tools > 0 ? [{ id: "tools", label: "Tools", tokens: promptParts.tools }] : []),
		{ id: "skills", label: "Skills", tokens: promptParts.skills },
		...(promptParts.extensions > 0 && promptParts.appendLabel
			? [{
				id: "extensions",
				label: promptParts.appendLabel,
				tokens: promptParts.extensions,
				source: promptParts.appendSource,
			}]
			: []),
		{ id: "context", label: "Project context", tokens: promptParts.context },
	].filter((part) => part.tokens > 0);

	const conversationTokens = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

	const parts = [...staticParts];
	if (conversationTokens > 0) {
		parts.push({ id: "conversation", label: "Conversation", tokens: conversationTokens });
	}

	if (totalUsed != null && totalUsed > 0) {
		const accounted = parts.reduce((sum, part) => sum + part.tokens, 0);
		const other = totalUsed - accounted;
		if (other > 0) {
			parts.push({ id: "other", label: "Tool schemas & vision", tokens: other });
		} else if (other < 0) {
			const conversation = parts.find((part) => part.id === "conversation");
			if (conversation) conversation.tokens = Math.max(0, conversation.tokens + other);
		}
	}

	return parts;
}

async function parseSessionContextUsage(content, cwd = DEFAULT_CWD) {
	const branchEntries = [];
	let modelId = null;

	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (row?.type === "model_change" && typeof row.modelId === "string") {
			modelId = row.modelId;
		}
		if (row?.type === "message" || row?.type === "compaction") {
			branchEntries.push(row);
		}
	}

	const contextWindow = resolveContextWindow(modelId);
	const messages = branchEntries
		.filter((entry) => entry.type === "message" && entry.message)
		.map((entry) => entry.message);

	let latestCompactionIndex = -1;
	for (let i = branchEntries.length - 1; i >= 0; i--) {
		if (branchEntries[i].type === "compaction") {
			latestCompactionIndex = i;
			break;
		}
	}

	if (latestCompactionIndex >= 0) {
		let hasPostCompactionUsage = false;
		for (let i = branchEntries.length - 1; i > latestCompactionIndex; i--) {
			const entry = branchEntries[i];
			if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
			const assistant = entry.message;
			if (assistant.stopReason === "aborted" || assistant.stopReason === "error") continue;
			if (calculateContextTokens(assistant.usage) > 0) {
				hasPostCompactionUsage = true;
			}
			break;
		}
		if (!hasPostCompactionUsage) {
			return {
				used: null,
				size: contextWindow,
				percent: null,
				breakdown: await buildContextBreakdown(messages, cwd, null),
			};
		}
	}

	let usageInfo = null;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		if (message.stopReason === "aborted" || message.stopReason === "error") continue;
		if (!message.usage) continue;
		usageInfo = { usage: message.usage, index: i };
		break;
	}

	let used;
	if (!usageInfo) {
		used = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
	} else {
		used = calculateContextTokens(usageInfo.usage);
		for (let i = usageInfo.index + 1; i < messages.length; i++) {
			used += estimateMessageTokens(messages[i]);
		}
	}

	const percent = contextWindow > 0 ? (used / contextWindow) * 100 : null;
	return {
		used,
		size: contextWindow,
		percent,
		breakdown: await buildContextBreakdown(messages, cwd, used),
	};
}

function sendContextUsage(ws, usage) {
	if (!usage) return;
	sendJson(ws, {
		type: "context",
		used: usage.used,
		size: usage.size,
		percent: usage.percent,
		breakdown: Array.isArray(usage.breakdown) ? usage.breakdown : [],
	});
}

async function readSessionContextUsage(sessionFileIndex, sessionId, cwd) {
	const filePath = sessionFileIndex?.get(sessionId);
	if (!filePath) return null;
	try {
		const content = await readFile(filePath, "utf8");
		return await parseSessionContextUsage(content, cwd);
	} catch {
		return null;
	}
}

async function getPiSessionsDir() {
	const agentDir = getPiAgentDir();
	const settingsPath = join(agentDir, "settings.json");
	try {
		const data = JSON.parse(await readFile(settingsPath, "utf8"));
		const sessionDir = data?.sessionDir;
		if (typeof sessionDir === "string" && sessionDir.trim()) {
			return isAbsolute(sessionDir) ? sessionDir : resolve(agentDir, sessionDir);
		}
	} catch {
		// ignore missing settings
	}
	return join(agentDir, "sessions");
}

async function walkJsonlFiles(dir, out) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const filePath = join(dir, entry.name);
		if (entry.isDirectory()) await walkJsonlFiles(filePath, out);
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(filePath);
	}
}

function parseSessionHeader(firstLine) {
	try {
		const obj = JSON.parse(firstLine);
		if (obj?.type !== "session") return null;
		const sessionId = typeof obj?.id === "string" ? obj.id : null;
		const cwd = typeof obj?.cwd === "string" ? obj.cwd : null;
		if (!sessionId || !cwd) return null;
		return { sessionId, cwd };
	} catch {
		return null;
	}
}

async function buildSessionFileIndex(cwd) {
	const index = new Map();
	const files = [];
	await walkJsonlFiles(await getPiSessionsDir(), files);
	await Promise.all(
		files.map(async (file) => {
			try {
				const handle = await open(file, "r");
				const buf = Buffer.alloc(4096);
				const { bytesRead } = await handle.read(buf, 0, 4096, 0);
				await handle.close();
				const firstLine = buf.subarray(0, bytesRead).toString("utf8").split("\n")[0]?.trim();
				const header = parseSessionHeader(firstLine);
				if (header?.cwd === cwd) index.set(header.sessionId, file);
			} catch {
				// ignore unreadable files
			}
		}),
	);
	return index;
}

const SESSION_INDEX_TTL_MS = 30_000;
const sessionFileIndexCache = new Map();

async function getSessionFileIndex(cwd, { bust = false } = {}) {
	const resolved = resolve(cwd || DEFAULT_CWD);
	if (!bust) {
		const cached = sessionFileIndexCache.get(resolved);
		if (cached && Date.now() - cached.at < SESSION_INDEX_TTL_MS) {
			return cached.index;
		}
	}
	const index = await buildSessionFileIndex(resolved);
	sessionFileIndexCache.set(resolved, { index, at: Date.now() });
	return index;
}

function invalidateSessionFileIndex(cwd) {
	if (cwd) sessionFileIndexCache.delete(resolve(cwd));
	else sessionFileIndexCache.clear();
}

function contributionDateKey(value) {
	if (value == null) return null;
	const date = typeof value === "number" ? new Date(value) : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
}

function countUserMessagesInLine(line, dayCounts) {
	if (!line.trim()) return;
	let row;
	try {
		row = JSON.parse(line);
	} catch {
		return;
	}
	if (row?.type !== "message" || row.message?.role !== "user") return;
	const key = contributionDateKey(row.timestamp ?? row.message?.timestamp);
	if (key && Object.hasOwn(dayCounts, key)) {
		dayCounts[key] += 1;
	}
}

async function scanSessionFileContributions(filePath, dayCounts) {
	try {
		const content = await readFile(filePath, "utf8");
		for (const line of content.split("\n")) {
			countUserMessagesInLine(line, dayCounts);
		}
	} catch {
		// ignore unreadable session files
	}
}

function buildContributionDayRange() {
	const end = new Date();
	end.setHours(0, 0, 0, 0);
	const days = {};
	const keys = [];
	for (let offset = 364; offset >= 0; offset -= 1) {
		const date = new Date(end);
		date.setDate(date.getDate() - offset);
		const key = date.toISOString().slice(0, 10);
		days[key] = 0;
		keys.push(key);
	}
	return { days, start: keys[0], end: keys[keys.length - 1] };
}

const contributionsCache = new Map();

async function aggregateContributions(cwd) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const { days, start, end } = buildContributionDayRange();
	const index = await getSessionFileIndex(resolvedCwd);
	await Promise.all([...index.values()].map((file) => scanSessionFileContributions(file, days)));
	const total = Object.values(days).reduce((sum, count) => sum + count, 0);
	return { days, total, start, end, cwd: resolvedCwd };
}

async function getContributions(cwd, { bust = false } = {}) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const cached = contributionsCache.get(resolvedCwd);
	if (!bust && cached && Date.now() - cached.at < 30_000) {
		return cached.data;
	}
	const data = await aggregateContributions(resolvedCwd);
	contributionsCache.set(resolvedCwd, { at: Date.now(), data });
	return data;
}

function invalidateContributionsCache(cwd) {
	if (cwd) contributionsCache.delete(resolve(cwd));
	else contributionsCache.clear();
}

function normalizePiMessageText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
		.filter(Boolean)
		.join("");
}

function userContentToWireEvents(content, messageId) {
	const events = [];
	const parts = Array.isArray(content)
		? content
		: typeof content === "string"
			? [{ type: "text", text: content }]
			: [];

	for (const part of parts) {
		if (part?.type === "text" && part.text) {
			events.push({ type: "user_chunk", text: part.text, messageId });
		} else if (part?.type === "image" && part.data) {
			events.push({
				type: "user_chunk",
				messageId,
				image: {
					mimeType: part.mimeType || "image/png",
					data: part.data,
				},
			});
		}
	}
	return events;
}

function toolResultToText(result) {
	if (!result) return "";
	const details = result.details;
	const diff = details?.diff;
	if (typeof diff === "string" && diff.trim()) return diff;
	if (Array.isArray(result.content)) {
		const texts = result.content
			.map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
			.filter(Boolean);
		if (texts.length) return texts.join("");
	}
	const stdout =
		details?.stdout ?? result.stdout ?? details?.output ?? result.output;
	const stderr = details?.stderr ?? result.stderr;
	if ((typeof stdout === "string" && stdout.trim()) || (typeof stderr === "string" && stderr.trim())) {
		const parts = [];
		if (typeof stdout === "string" && stdout.trim()) parts.push(stdout);
		if (typeof stderr === "string" && stderr.trim()) parts.push(`stderr:\n${stderr}`);
		return parts.join("\n\n").trimEnd();
	}
	try {
		return JSON.stringify(result, null, 2);
	} catch {
		return String(result);
	}
}

function parseSessionJsonl(content) {
	const events = [];
	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (row?.type !== "message") continue;
		const message = row.message;
		if (!message) continue;

		const role = String(message.role ?? "");
		if (role === "user") {
			events.push(...userContentToWireEvents(message.content, row.id));
			continue;
		}
		if (role === "assistant") {
			const content = message.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					if (part?.type === "toolCall") {
						const toolCallId = String(part.id ?? part.toolCallId ?? crypto.randomUUID());
						const toolName = prettifyToolName(String(part.name ?? part.toolName ?? "tool")) ?? "tool";
						events.push({
							type: "tool",
							event: "start",
							id: toolCallId,
							title: toolName,
							toolName,
							status: "completed",
							kind: toolName,
							rawInput: part.arguments ?? part.input ?? null,
						});
					} else if (part?.type === "text" && part.text) {
						events.push({ type: "chunk", text: part.text });
					} else if (part?.type === "thinking" && part.thinking) {
						events.push({ type: "thought", text: part.thinking });
					}
				}
			} else {
				const text = normalizePiMessageText(content);
				if (text) events.push({ type: "chunk", text });
			}
			continue;
		}
		if (role === "toolResult") {
			const toolCallId = String(message.toolCallId ?? crypto.randomUUID());
			const toolName = prettifyToolName(String(message.toolName ?? "tool")) ?? "tool";
			events.push({
				type: "tool",
				event: "start",
				id: toolCallId,
				title: toolName,
				toolName,
				status: "completed",
				kind: toolName,
			});
			const outputText = toolResultToText(message);
			const hasSubagentDetails =
				message.toolName === "subagent" ||
				(message.details && typeof message.details === "object" && Array.isArray(message.details.results));
			events.push({
				type: "tool",
				event: "update",
				id: toolCallId,
				status: message.isError ? "failed" : "completed",
				rawOutput: hasSubagentDetails
					? truncateWire(message)
					: outputText
						? truncateWire(outputText)
						: truncateWire(message),
			});
		}
	}
	return events;
}

function updateToWireEvents(update, toolTracker) {
	switch (update.sessionUpdate) {
		case "user_message_chunk": {
			return userContentToWireEvents(
				update.content?.type ? [update.content] : [],
				update.messageId,
			);
		}
		case "agent_message_chunk": {
			if (update.content?.type === "text" && update.content.text) {
				if (isStartupInfo(update.content.text)) return [];
				return [{ type: "chunk", text: update.content.text }];
			}
			return [];
		}
		case "agent_thought_chunk": {
			if (update.content?.type === "text" && update.content.text) {
				if (isStartupInfo(update.content.text)) return [];
				return [{ type: "thought", text: update.content.text }];
			}
			return [];
		}
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
			if (update.rawInput != null) payload.rawInput = truncateWire(update.rawInput);
			if (update.rawOutput != null) payload.rawOutput = truncateWire(update.rawOutput);
			return [payload];
		}
		case "plan":
			return [
				{
					type: "plan",
					entries: update.entries ?? [],
				},
			];
		default:
			return [];
	}
}

function sendHistoryBatch(ws, events, extra = {}) {
	if (!events?.length) return;
	sendJson(ws, { type: "history", events, ...extra });
}

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

function forwardUserMessageChunk(update, ws) {
	const payload = {
		type: "user_chunk",
		messageId: update.messageId ?? undefined,
	};

	const content = update.content;
	if (content?.type === "text" && content.text) {
		sendJson(ws, { ...payload, text: content.text });
	} else if (content?.type === "image" && content.data && content.mimeType) {
		sendJson(ws, {
			...payload,
			image: { mimeType: content.mimeType, data: content.data },
		});
	}
}

function forwardDefaultsUpdate(update, ws) {
	switch (update.sessionUpdate) {
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

function forwardSessionUpdate(update, ws, { slimTools = false, toolTracker = null, startupFilter = null } = {}) {
	switch (update.sessionUpdate) {
		case "user_message_chunk":
			forwardUserMessageChunk(update, ws);
			break;
		case "agent_message_chunk":
			if (update.content?.type === "text" && update.content.text) {
				const text = startupFilter
					? startupFilter.filter(update.content.text)
					: isStartupInfo(update.content.text)
						? null
						: update.content.text;
				if (text != null) sendJson(ws, { type: "chunk", text });
			}
			break;
		case "agent_thought_chunk":
			if (update.content?.type === "text" && update.content.text) {
				const text = startupFilter
					? startupFilter.filter(update.content.text)
					: isStartupInfo(update.content.text)
						? null
						: update.content.text;
				if (text != null) sendJson(ws, { type: "thought", text });
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
		case "usage_update":
			sendContextUsage(ws, {
				used: update.used,
				size: update.size,
				percent: update.size > 0 ? (update.used / update.size) * 100 : null,
			});
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

async function resolveProjectPath(input) {
	if (!input || typeof input !== "string") {
		throw new Error("Project path is required");
	}

	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error("Project path is required");
	}

	const resolved = resolve(trimmed);
	const info = await stat(resolved);
	if (!info.isDirectory()) {
		throw new Error("Project path must be a directory");
	}

	await access(resolved);
	return resolved;
}

async function getGitInfo(cwd) {
	const branch = await gitBranch(cwd);
	const branches = await gitBranches(cwd);
	return {
		path: cwd,
		project: basename(cwd),
		branch,
		branches,
	};
}

async function serveGitInfo(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const info = await getGitInfo(cwd);
		res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify(info));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ message }));
	}
}

async function serveContributions(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");
	const bust = url.searchParams.get("refresh") === "1";

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const data = await getContributions(cwd, { bust });
		res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify(data));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
		res.end(JSON.stringify({ message }));
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

	if (pathname === "/api/contributions") {
		await serveContributions(req, res);
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
		this.pendingModelId = null;
		this.cwd = DEFAULT_CWD;
		this.toolTracker = createToolCallTracker();
		this.startupFilter = createStartupInfoFilter();
		this.cachedNewSession = null;
		this.cachedNewSessionPromise = null;
		this.hiddenSessionIds = new Set();
		this.historyCache = new Map();
		this.historyCachePromises = new Map();
		this.preloadChain = Promise.resolve();
		this.sessionLoadMutex = Promise.resolve();
		this.sessionLoadGeneration = 0;
		this.sessionFileIndex = new Map();
		this.contextRefreshTimer = null;
		this.pendingPermissions = new Map();
		this.defaultsFetched = false;
		this.defaultsFetchPromise = null;
	}

	resolvePermissionResponse(requestId, { optionId, cancelled = false } = {}) {
		const pending = this.pendingPermissions.get(requestId);
		if (!pending) return false;

		clearTimeout(pending.timeout);
		this.pendingPermissions.delete(requestId);

		if (cancelled || !optionId) {
			pending.resolve({ outcome: { outcome: "cancelled" } });
			return true;
		}

		const selected = pending.options.find((option) => option.optionId === optionId);
		if (!selected) {
			pending.resolve({ outcome: { outcome: "cancelled" } });
			return true;
		}

		sendJson(this.ws, {
			type: "permission",
			tool: pending.tool.title ?? pending.tool.kind ?? "tool",
			choice: permissionOptionLabel(selected),
			optionId: selected.optionId,
		});

		pending.resolve({
			outcome: {
				outcome: "selected",
				optionId: selected.optionId,
			},
		});
		return true;
	}

	cancelAllPendingPermissions() {
		for (const [, pending] of this.pendingPermissions) {
			clearTimeout(pending.timeout);
			pending.resolve({ outcome: { outcome: "cancelled" } });
		}
		this.pendingPermissions.clear();
	}

	async refreshContextUsage() {
		const sessionId = this.session?.sessionId;
		if (!sessionId || this.closed) return;

		const usage = await readSessionContextUsage(this.sessionFileIndex, sessionId, this.cwd);
		if (usage) sendContextUsage(this.ws, usage);
	}

	scheduleContextRefresh(delayMs = 120) {
		clearTimeout(this.contextRefreshTimer);
		this.contextRefreshTimer = setTimeout(() => {
			this.contextRefreshTimer = null;
			void this.refreshContextUsage();
		}, delayMs);
	}

	async withSessionLoad(fn) {
		const run = this.sessionLoadMutex.then(fn, fn);
		this.sessionLoadMutex = run.then(
			() => {},
			() => {},
		);
		return run;
	}

	historyCacheKey(sessionId) {
		return `${this.cwd}:${sessionId}`;
	}

	clearSessionCaches() {
		if (this.cachedNewSession) {
			this.cachedNewSession.dispose();
			this.cachedNewSession = null;
		}

		clearTimeout(this.contextRefreshTimer);
		this.contextRefreshTimer = null;
		this.cachedNewSessionPromise = null;
		this.hiddenSessionIds.clear();
		this.historyCache.clear();
		this.historyCachePromises.clear();
		this.preloadChain = Promise.resolve();
		this.sessionFileIndex = new Map();
	}

	visibleSessions(sessions) {
		const activeId = this.session?.sessionId;
		return (sessions ?? []).filter((session) => {
			if (!session?.sessionId) return false;
			if (session.sessionId === activeId) return true;
			return !this.hiddenSessionIds.has(session.sessionId);
		});
	}

	invalidateHistoryCache(sessionId) {
		if (!sessionId) return;
		this.historyCache.delete(this.historyCacheKey(sessionId));
	}

	scheduleDiskPreload(sessionId) {
		const key = this.historyCacheKey(sessionId);
		if (this.historyCache.has(key) || this.historyCachePromises.has(key)) return;

		const filePath = this.sessionFileIndex?.get(sessionId);
		if (!filePath) return;

		const promise = readFile(filePath, "utf8")
			.then((content) => {
				if (this.closed) return;
				const wireEvents = parseSessionJsonl(content);
				this.historyCache.set(key, { wireEvents });
			})
			.catch(() => {});

		this.historyCachePromises.set(key, promise);
		void promise.finally(() => this.historyCachePromises.delete(key));
	}

	async getHistoryCache(sessionId) {
		const key = this.historyCacheKey(sessionId);
		const pending = this.historyCachePromises.get(key);
		if (pending) await pending.catch(() => {});

		let cached = this.historyCache.get(key);
		if (cached?.wireEvents) return cached;

		const filePath = this.sessionFileIndex?.get(sessionId);
		if (!filePath) return null;

		try {
			const content = await readFile(filePath, "utf8");
			const wireEvents = parseSessionJsonl(content);
			cached = { wireEvents };
			this.historyCache.set(key, cached);
			return cached;
		} catch {
			return null;
		}
	}

	async ensureCachedNewSession() {
		if (this.closed || !this.ctx || this.session || this.cachedNewSession || this.cachedNewSessionPromise) {
			return;
		}

		this.cachedNewSessionPromise = (async () => {
			try {
				const session = await this.ctx.buildSession(this.cwd).start();
				if (!this.closed && !this.cachedNewSession) {
					this.hiddenSessionIds.add(session.sessionId);
					this.cachedNewSession = session;
				} else {
					session.dispose();
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error("[pi-web] failed to precache new session:", message);
			} finally {
				this.cachedNewSessionPromise = null;
			}
		})();

		await this.cachedNewSessionPromise;
	}

	warmSessionCaches(sessions) {
		if (!this.session) void this.ensureCachedNewSession();

		for (const session of sessions) {
			this.scheduleDiskPreload(session.sessionId);
		}
	}
	async drainProbeDefaults(probe, timeoutMs = 3000) {
		const deadline = Date.now() + timeoutMs;
		let lastCommandUpdateAt = 0;

		while (Date.now() < deadline) {
			try {
				const msg = await Promise.race([
					probe.nextUpdate(),
					new Promise((resolve) => setTimeout(() => resolve(null), 200)),
				]);
				if (!msg) {
					if (lastCommandUpdateAt && Date.now() - lastCommandUpdateAt > 500) {
						return;
					}
					continue;
				}
				if (msg.kind === "session_update") {
					forwardDefaultsUpdate(msg.update, this.ws);
					if (msg.update.sessionUpdate === "available_commands_update") {
						lastCommandUpdateAt = Date.now();
					}
				}
			} catch {
				break;
			}
		}
	}

	async fetchAgentDefaults() {
		if (this.defaultsFetched || this.defaultsFetchPromise || this.closed || !this.ctx) {
			return;
		}

		this.defaultsFetchPromise = (async () => {
			const replayDefaults = (params) => {
				forwardDefaultsUpdate(params.update, this.ws);
			};

			let probe = null;
			try {
				this.replayHandler = replayDefaults;
				probe = await this.ctx.buildSession(this.cwd).start();
				this.hiddenSessionIds.add(probe.sessionId);
				sendModelsFromConfigOptions(this.ws, probe.newSessionResponse.configOptions);
				await this.drainProbeDefaults(probe);
				this.defaultsFetched = true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error("[pi-web] failed to fetch agent defaults:", message);
			} finally {
				this.replayHandler = null;
				probe?.dispose();
				this.defaultsFetchPromise = null;
			}
		})();

		await this.defaultsFetchPromise;
	}

	async applyPendingModel() {
		if (!this.pendingModelId || !this.session) return;

		const value = this.pendingModelId;
		this.pendingModelId = null;

		try {
			const response = await this.ctx.request(acp.methods.agent.session.setConfigOption, {
				sessionId: this.session.sessionId,
				configId: "model",
				value,
			});
			sendModelsFromConfigOptions(this.ws, response.configOptions);
		} catch (error) {
			this.pendingModelId = value;
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
		}
	}

	async disconnectAgent() {
		this.cancelAllPendingPermissions();
		this.clearSessionCaches();
		await this.disposeActiveSession();
		this.replayHandler = null;

		if (this.connection) {
			this.connection.close();
			this.connection = null;
			this.ctx = null;
		}

		if (this.agentProcess && !this.agentProcess.killed) {
			this.agentProcess.kill();
			this.agentProcess = null;
		}

		await this.pumpPromise?.catch(() => {});
		this.pumpPromise = null;
		this.busy = false;
		this.toolTracker.reset();
		this.startupFilter.reset();
	}

	async connectAgent() {
		sendJson(this.ws, { type: "status", state: "connecting", cwd: this.cwd });

		this.agentProcess = spawnPiAcp(this.cwd);
		const input = Writable.toWeb(this.agentProcess.stdin);
		const output = Readable.toWeb(this.agentProcess.stdout);
		const stream = acp.ndJsonStream(input, output);

		const app = createAcpClient(this);
		this.connection = app.connect(stream);
		this.ctx = this.connection.agent;

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

		const [listResponse, sessionFileIndex] = await Promise.all([
			this.ctx.request(acp.methods.agent.session.list, {
				cwd: this.cwd,
			}),
			getSessionFileIndex(this.cwd),
		]);
		const sessions = this.visibleSessions(listResponse.sessions ?? []);
		sendJson(this.ws, { type: "sessions", sessions });

		this.sessionFileIndex = sessionFileIndex;
		this.sendReady();
		void this.warmSessionCaches(sessions);
	}

	async start() {
		try {
			await this.connectAgent();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "status", state: "error", message });
			throw error;
		}
	}

	async setProjectPath(input) {
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message" });
			return;
		}

		let resolved;
		try {
			resolved = await resolveProjectPath(input);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
			return;
		}

		if (resolved === this.cwd) {
			sendJson(this.ws, { type: "project", ...(await getGitInfo(this.cwd)) });
			return;
		}

		this.cwd = resolved;
		this.pendingModelId = null;
		this.defaultsFetched = false;
		this.sessionLoadGeneration++;
		invalidateSessionFileIndex(resolved);

		await this.disconnectAgent();

		sendJson(this.ws, { type: "clear" });
		sendJson(this.ws, { type: "sessions", sessions: [] });
		sendJson(this.ws, { type: "commands", commands: [] });

		try {
			await this.connectAgent();
			sendJson(this.ws, { type: "project", ...(await getGitInfo(this.cwd)) });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
			sendJson(this.ws, { type: "status", state: "error", message });
		}
	}

	sendReady(extra = {}) {
		sendJson(this.ws, {
			type: "status",
			state: "ready",
			sessionId: this.session?.sessionId,
			protocolVersion: this.protocolVersion,
			cwd: this.cwd,
			...extra,
		});
	}

	releaseBusy(stopReason = "end_turn") {
		if (!this.busy) return;
		this.busy = false;
		sendJson(this.ws, {
			type: "done",
			stopReason,
		});
	}

	async disposeActiveSession() {
		if (!this.session) return;

		const oldSession = this.session;
		this.session = null;
		oldSession.dispose();

		await this.pumpPromise?.catch(() => {});
		this.pumpPromise = null;
		this.releaseBusy("cancelled");
	}

	async loadSession(sessionId, { replay = true, requestId = null, generation = null } = {}) {
		const meta = requestId == null ? {} : { requestId };
		const isStale = () => generation != null && generation !== this.sessionLoadGeneration;
		const cached = replay ? await this.getHistoryCache(sessionId) : null;

		if (this.closed || isStale()) return;

		sendJson(this.ws, { type: "clear", ...meta });
		this.toolTracker.reset();
		this.startupFilter.reset();

		if (cached?.wireEvents?.length) {
			sendJson(this.ws, { type: "status", state: "loading_history", ...meta });
			sendHistoryBatch(this.ws, cached.wireEvents, meta);
		} else if (replay) {
			sendJson(this.ws, { type: "status", state: "loading_history", ...meta });
		}

		await this.withSessionLoad(async () => {
			if (this.closed || isStale()) return;

			await this.disposeActiveSession();
			if (this.closed || isStale()) return;

			this.toolTracker.reset();

			const collected = [];

			if (this.closed || isStale()) return;

			if (cached?.wireEvents?.length) {
				// Already replayed from disk above so the UI can update immediately.
			} else if (replay) {
				this.replayHandler = (params) => {
					for (const event of updateToWireEvents(params.update, this.toolTracker)) {
						collected.push(event);
					}
				};
			}

			let loadResponse = null;
			try {
				loadResponse = await this.ctx.request(acp.methods.agent.session.load, {
					sessionId,
					cwd: this.cwd,
					mcpServers: [],
				});
			} finally {
				this.replayHandler = null;
			}

			if (this.closed || isStale()) return;

			if (collected.length) {
				sendHistoryBatch(this.ws, collected, meta);
				this.historyCache.set(this.historyCacheKey(sessionId), { wireEvents: collected });
			}

			if (loadResponse?.configOptions) {
				sendModelsFromConfigOptions(this.ws, loadResponse.configOptions);
			}

			this.session = this.ctx.attachSession({ sessionId });
			this.pumpPromise = this.pumpUpdates();

			sendJson(this.ws, { type: "session", sessionId, cached: Boolean(cached?.wireEvents?.length), cwd: this.cwd, ...meta });
			this.sendReady(meta);
			void this.applyPendingModel();
			void this.refreshSessions();
			this.scheduleContextRefresh(0);
		});
	}

	async createSession() {
		if (this.cachedNewSessionPromise) {
			await this.cachedNewSessionPromise.catch(() => {});
		}

		invalidateSessionFileIndex(this.cwd);

		await this.disposeActiveSession();
		sendJson(this.ws, { type: "clear" });
		this.toolTracker.reset();
		this.startupFilter.reset();

		let cached = false;
		if (this.cachedNewSession) {
			this.session = this.cachedNewSession;
			this.cachedNewSession = null;
			this.hiddenSessionIds.delete(this.session.sessionId);
			cached = true;
			sendModelsFromConfigOptions(this.ws, this.session.newSessionResponse.configOptions);
		} else {
			this.session = await this.ctx.buildSession(this.cwd).start();
			sendModelsFromConfigOptions(this.ws, this.session.newSessionResponse.configOptions);
		}

		this.pumpPromise = this.pumpUpdates();

		sendJson(this.ws, {
			type: "session",
			sessionId: this.session.sessionId,
			cached,
			cwd: this.cwd,
		});
		this.sendReady();
		void this.applyPendingModel();
		void this.refreshSessions();
		void this.ensureCachedNewSession();
		this.scheduleContextRefresh(0);
	}

	async refreshSessions() {
		try {
			const listResponse = await this.ctx.request(acp.methods.agent.session.list, {
				cwd: this.cwd,
			});
			let sessions = this.visibleSessions(listResponse.sessions ?? []);
			const activeId = this.session?.sessionId;
			if (activeId && sessions.length === 0 && !this.busy) {
				sessions = [
					{
						sessionId: activeId,
						title: null,
						cwd: this.cwd,
					},
					...sessions,
				];
			}
			this.sessionFileIndex = await getSessionFileIndex(this.cwd);
			sendJson(this.ws, { type: "sessions", sessions });
			this.warmSessionCaches(sessions);
			this.scheduleContextRefresh(0);
		} catch {
			// ignore list errors during refresh
		}
	}

	async switchSession(sessionId, requestId = null) {
		if (!sessionId) {
			sendJson(this.ws, { type: "error", message: "sessionId is required", ...(requestId == null ? {} : { requestId }) });
			return;
		}
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message", ...(requestId == null ? {} : { requestId }) });
			return;
		}

		const generation = ++this.sessionLoadGeneration;
		try {
			await this.loadSession(sessionId, { requestId, generation });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (generation === this.sessionLoadGeneration) {
				sendJson(this.ws, { type: "error", message, ...(requestId == null ? {} : { requestId }) });
			}
		}
	}

	async newSession() {
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message" });
			return;
		}

		this.sessionLoadGeneration++;
		try {
			await this.createSession();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
		}
	}

	async compactSession(customInstructions) {
		if (this.busy) {
			sendJson(this.ws, { type: "error", message: "Pi is still working on the previous message" });
			return;
		}

		if (!this.session) {
			sendJson(this.ws, { type: "error", message: "No active session to compact" });
			return;
		}

		const instructions = typeof customInstructions === "string" ? customInstructions.trim() : "";
		const prompt = instructions ? `/compact ${instructions}` : "/compact";

		this.busy = true;
		sendJson(this.ws, { type: "status", state: "busy" });

		try {
			await this.session.prompt(prompt);
			invalidateContributionsCache(this.cwd);
			void this.refreshSessions();
		} catch (error) {
			this.busy = false;
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
			sendJson(this.ws, { type: "status", state: "ready" });
		}
	}

	async pumpUpdates() {
		const activeSession = this.session;
		while (!this.closed && this.session === activeSession && activeSession) {
			try {
				const message = await activeSession.nextUpdate();
				if (message.kind === "session_update") {
					forwardSessionUpdate(message.update, this.ws, {
						toolTracker: this.toolTracker,
						startupFilter: this.startupFilter,
					});
					if (this.busy && message.update.sessionUpdate !== "usage_update") {
						this.scheduleContextRefresh(400);
					}
				} else if (message.kind === "stop") {
					this.busy = false;
					this.invalidateHistoryCache(activeSession.sessionId);
					sendJson(this.ws, {
						type: "done",
						stopReason: message.stopReason,
					});
					this.scheduleContextRefresh(250);
				}
			} catch (error) {
				if (this.closed || this.session !== activeSession) break;
				const msg = error instanceof Error ? error.message : String(error);
				sendJson(this.ws, { type: "error", message: msg });
				this.releaseBusy("error");
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
			invalidateContributionsCache(this.cwd);
			void this.refreshSessions();
		} catch (error) {
			this.busy = false;
			const message = error instanceof Error ? error.message : String(error);
			sendJson(this.ws, { type: "error", message });
			sendJson(this.ws, { type: "status", state: "ready" });
		}
	}

	async setModel(value) {
		if (!value) {
			sendJson(this.ws, { type: "error", message: "Model value is required" });
			return;
		}

		if (!this.session) {
			this.pendingModelId = value;
			sendJson(this.ws, { type: "models", current: value });
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
		this.cancelAllPendingPermissions();
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
		clearTimeout(this.contextRefreshTimer);
		this.contextRefreshTimer = null;
		await this.disconnectAgent();
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
			await pi.switchSession(msg.sessionId, msg.requestId ?? null);
		} else if (msg.type === "new_session") {
			await pi.newSession();
		} else if (msg.type === "compact") {
			await pi.compactSession(msg.instructions);
		} else if (msg.type === "set_model") {
			await pi.setModel(msg.value);
		} else if (msg.type === "set_cwd") {
			await pi.setProjectPath(msg.path ?? msg.cwd ?? "");
		} else if (msg.type === "permission_response") {
			pi.resolvePermissionResponse(msg.requestId, {
				optionId: msg.optionId,
				cancelled: msg.cancelled === true,
			});
		} else if (msg.type === "fetch_defaults") {
			void pi.fetchAgentDefaults();
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
	console.log(`default project cwd: ${DEFAULT_CWD}`);
	console.log(`pi-acp: ${PI_ACP_COMMAND} ${PI_ACP_ARGS.join(" ")}`);
});
