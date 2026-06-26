import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { APP_ROOT, DEFAULT_CWD } from "../config.js";
import { getPiAgentDir } from "../sessions/sessionFiles.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;

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
		join(APP_ROOT, "node_modules", "@earendil-works", "pi-coding-agent"),
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

export async function parseSessionContextUsage(content, cwd = DEFAULT_CWD) {
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

export async function readSessionContextUsage(sessionFileIndex, sessionId, cwd) {
	const filePath = sessionFileIndex?.get(sessionId);
	if (!filePath) return null;
	try {
		const content = await readFile(filePath, "utf8");
		return await parseSessionContextUsage(content, cwd);
	} catch {
		return null;
	}
}
