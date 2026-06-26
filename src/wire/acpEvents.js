import { randomUUID } from "node:crypto";

import { sendContextUsage, sendJson, truncateWire } from "./send.js";

function looksLikeToolId(value) {
	if (typeof value !== "string" || !value) return false;
	return /^tool_[0-9a-f-]+$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

export function createToolCallTracker() {
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

export function createStartupInfoFilter() {
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

export function parseSessionJsonl(content) {
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
						const toolCallId = String(part.id ?? part.toolCallId ?? randomUUID());
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
			const toolCallId = String(message.toolCallId ?? randomUUID());
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

export function updateToWireEvents(update, toolTracker) {
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

export function sendHistoryBatch(ws, events, extra = {}) {
	if (!events?.length) return;
	sendJson(ws, { type: "history", events, ...extra });
}

export function sendModelsFromConfigOptions(ws, configOptions) {
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

export function sendCommands(ws, commands) {
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

export function forwardDefaultsUpdate(update, ws) {
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

export function forwardSessionUpdate(update, ws, { slimTools = false, toolTracker = null, startupFilter = null } = {}) {
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
