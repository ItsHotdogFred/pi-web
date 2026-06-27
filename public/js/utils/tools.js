import { app } from "../state/store.js";
import {
	isStartupDump,
	couldBeStartupPartial,
	SKILLS_MARKER,
} from "../shared/startupMarkers.js";

export { couldBeStartupPartial };

const FRIENDLY_TOOL_NAMES = { ffgrep: "grep", fffind: "find", bash: "shell" };

export function isToolCallId(name) {
	return typeof name === "string" && /^tool_[0-9a-f-]{8,}$/i.test(name.trim());
}

export function stripToolPrefix(name) {
	if (!name) return "";
	let s = name.trim();
	if (s.startsWith("mcp_pi_")) return s.slice(7);
	if (s.startsWith("mcp_")) return s.slice(4);
	return s;
}

function parseNameFromRaw(raw) {
	if (raw == null || raw === "") return null;
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (parsed && typeof parsed === "object") {
			return parsed.toolName || parsed.name || parsed.title || parsed.tool || null;
		}
	} catch {
		/* plain text */
	}
	return null;
}

export function normalizeToolName(name) {
	if (!name || typeof name !== "string") return null;
	const stripped = stripToolPrefix(name);
	if (!stripped || isToolCallId(stripped) || isToolCallId(name)) return null;
	return FRIENDLY_TOOL_NAMES[stripped] || stripped;
}

function isGenericToolName(name) {
	return typeof name === "string" && name.trim().toLowerCase() === "tool";
}

export function mergeToolName(current, incoming) {
	if (!incoming) return current;
	if (!isGenericToolName(incoming)) return incoming;
	if (current && !isGenericToolName(current)) return current;
	return incoming;
}

export function resolveToolName(data) {
	for (const candidate of [
		data.title,
		data.toolName,
		parseNameFromRaw(data.rawOutput),
		parseNameFromRaw(data.rawInput),
		data.kind,
	]) {
		const name = normalizeToolName(candidate);
		if (name) return name;
	}
	return "Tool";
}

export function isPiStartupDump(text) {
	return isStartupDump(text);
}

export function resetStartupSuppression() {
	app.connection.startupBuffer = "";
	app.connection.startupInfoSkipped = false;
	app.connection.suppressStartupDump = false;
	app.connection.startupBufferChunks = 0;
}

export function shouldSkipStartupContent(text) {
	if (!app.connection.suppressStartupDump && app.connection.connectionState !== "connecting") return false;
	if (app.connection.startupInfoSkipped) return false;
	app.connection.startupBuffer += text;
	app.connection.startupBufferChunks++;
	if (isPiStartupDump(app.connection.startupBuffer)) {
		app.connection.startupInfoSkipped = true;
		app.connection.startupBuffer = "";
		app.connection.startupBufferChunks = 0;
		return true;
	}
	if (app.connection.startupBuffer.includes(SKILLS_MARKER)) {
		app.connection.startupInfoSkipped = true;
		app.connection.startupBuffer = "";
		app.connection.startupBufferChunks = 0;
		return true;
	}
	if (app.connection.startupBufferChunks >= 8) {
		app.connection.startupInfoSkipped = true;
		app.connection.startupBuffer = "";
		app.connection.startupBufferChunks = 0;
		return false;
	}
	if (couldBeStartupPartial(app.connection.startupBuffer)) return true;
	app.connection.startupBuffer = "";
	app.connection.startupBufferChunks = 0;
	return false;
}

export function formatSubagentToolCall(name, args) {
	const toolName = normalizeToolName(name) || name || "tool";
	if (toolName === "read" || toolName === "write" || toolName === "edit") {
		const path = args?.path ?? args?.file ?? "";
		return `${toolName} ${path}`;
	}
	if (toolName === "grep") {
		return `grep /${args?.pattern ?? ""}/ in ${args?.path ?? "."}`;
	}
	if (toolName === "shell" || toolName === "bash") {
		const command = String(args?.command ?? "").trim();
		return command.length > 72 ? `shell ${command.slice(0, 72)}…` : `shell ${command}`;
	}
	const preview = JSON.stringify(args ?? {});
	return preview.length > 72 ? `${toolName} ${preview.slice(0, 72)}…` : `${toolName} ${preview}`;
}
