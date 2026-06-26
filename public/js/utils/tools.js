import { app } from "../state/store.js";

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

export function parseNameFromRaw(raw) {
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

export function isGenericToolName(name) {
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
	return text.includes("## Skills") && text.includes("## Extensions");
}

export function couldBeStartupPartial(buffer) {
	if (buffer.includes("## Skills") && !buffer.includes("## Extensions")) return true;
	for (const marker of ["## Skills", "## Extensions"]) {
		for (let i = 1; i < marker.length; i++) {
			if (buffer.endsWith(marker.slice(0, i))) return true;
		}
	}
	return false;
}

export function resetStartupSuppression() {
	app.startupBuffer = "";
	app.startupInfoSkipped = false;
	app.suppressStartupDump = false;
	app.startupBufferChunks = 0;
}

export function shouldSkipStartupContent(text) {
	if (!app.suppressStartupDump && app.connectionState !== "connecting") return false;
	if (app.startupInfoSkipped) return false;
	app.startupBuffer += text;
	app.startupBufferChunks++;
	if (isPiStartupDump(app.startupBuffer)) {
		app.startupInfoSkipped = true;
		app.startupBuffer = "";
		app.startupBufferChunks = 0;
		return true;
	}
	if (app.startupBuffer.includes("## Skills")) {
		app.startupInfoSkipped = true;
		app.startupBuffer = "";
		app.startupBufferChunks = 0;
		return true;
	}
	if (app.startupBufferChunks >= 8) {
		app.startupInfoSkipped = true;
		app.startupBuffer = "";
		app.startupBufferChunks = 0;
		return false;
	}
	if (couldBeStartupPartial(app.startupBuffer)) return true;
	app.startupBuffer = "";
	app.startupBufferChunks = 0;
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
