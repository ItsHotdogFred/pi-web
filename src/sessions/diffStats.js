function extractFilePath(payload) {
	if (!payload || typeof payload !== "object") return null;
	return payload.path || payload.file_path || payload.filePath || payload.file || payload.target || null;
}

function parseToolPayload(raw) {
	if (raw == null) return null;
	if (typeof raw === "object") {
		if (raw.truncated && typeof raw.preview === "string") {
			try {
				return JSON.parse(raw.preview);
			} catch {
				return null;
			}
		}
		return raw;
	}
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function looksLikeUnifiedDiff(text) {
	if (!text || typeof text !== "string") return false;
	const trimmed = text.trim();
	return /^(\-\-\-|\+\+\+|@@)/m.test(trimmed);
}

function buildSyntheticDiff(input) {
	const path = extractFilePath(input) ?? "file";
	const oldText = String(input.old_string ?? "");
	const newText = String(input.new_string ?? input.content ?? "");
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const lines = [`--- a/${path}`, `+++ b/${path}`];
	const max = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < max; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];
		if (oldLine === newLine) {
			if (oldLine !== undefined) lines.push(` ${oldLine}`);
		} else {
			if (oldLine !== undefined) lines.push(`-${oldLine}`);
			if (newLine !== undefined) lines.push(`+${newLine}`);
		}
	}
	return lines.join("\n");
}

function buildWriteDiff(input) {
	const path = extractFilePath(input) ?? "file";
	const content = String(input.content ?? "");
	if (!content.trim()) return null;
	const contentLines = content.split("\n");
	const lines = [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${contentLines.length} @@`];
	for (const line of contentLines) {
		lines.push(`+${line}`);
	}
	return lines.join("\n");
}

function buildEditDiffFromInput(input) {
	const path = extractFilePath(input) ?? "file";

	if (Array.isArray(input.edits) && input.edits.length) {
		const lines = [`--- a/${path}`, `+++ b/${path}`];
		for (const edit of input.edits) {
			const oldText = String(edit.oldText ?? edit.old_string ?? "");
			const newText = String(edit.newText ?? edit.new_string ?? "");
			if (oldText) {
				for (const line of oldText.split("\n")) lines.push(`-${line}`);
			}
			if (newText) {
				for (const line of newText.split("\n")) lines.push(`+${line}`);
			}
		}
		return lines.length > 2 ? lines.join("\n") : null;
	}

	const oldText = input.oldText ?? input.old_string;
	const newText = input.newText ?? input.new_string;
	if (oldText != null || newText != null) {
		return buildSyntheticDiff({
			path,
			old_string: oldText ?? "",
			new_string: newText ?? "",
		});
	}

	return null;
}

function isDiffToolName(name) {
	return /^(edit|write|patch|replace|create)$/.test(String(name ?? "").toLowerCase());
}

export function countDiffLines(diffText) {
	if (!diffText || typeof diffText !== "string") {
		return { linesAdded: 0, linesRemoved: 0 };
	}
	let linesAdded = 0;
	let linesRemoved = 0;
	for (const line of diffText.split("\n")) {
		if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) continue;
		if (line.startsWith("+")) linesAdded += 1;
		else if (line.startsWith("-")) linesRemoved += 1;
	}
	return { linesAdded, linesRemoved };
}

export function diffFromToolInput(toolName, input) {
	const name = String(toolName ?? "").toLowerCase();
	const payload = parseToolPayload(input);
	if (!payload) return null;

	const editDiff = buildEditDiffFromInput(payload);
	if (editDiff) return editDiff;

	const writeContent = payload.content ?? payload.text;
	if ((name === "write" || name === "create") && writeContent != null) {
		return buildWriteDiff({ ...payload, content: writeContent });
	}

	if (isDiffToolName(name) && typeof payload.diff === "string") {
		return payload.diff;
	}

	return null;
}

function parseRawObject(value) {
	if (value == null || value === "") return null;
	if (typeof value === "object") {
		if (value.truncated) return null;
		return value;
	}
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return null;
}

function textFromToolResultContent(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n");
}

export function extractDiffFromToolResult(message) {
	if (message?.role !== "toolResult") return null;

	const rawText = textFromToolResultContent(message.content);
	const parsed = parseRawObject(rawText);
	if (parsed?.details?.diff && typeof parsed.details.diff === "string") return parsed.details.diff;
	if (parsed?.diff && typeof parsed.diff === "string") return parsed.diff;

	if (looksLikeUnifiedDiff(rawText)) return rawText;

	return null;
}

function addDiffStats(totals, diffText) {
	const { linesAdded, linesRemoved } = countDiffLines(diffText);
	totals.linesAdded += linesAdded;
	totals.linesRemoved += linesRemoved;
}

export function statsFromJsonlContent(content) {
	const totals = { linesAdded: 0, linesRemoved: 0 };
	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (row?.type !== "message") continue;

		const msg = row.message;
		if (!msg) continue;

		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const part of msg.content) {
				if (part?.type !== "toolCall") continue;
				const toolName = part.name ?? part.toolName;
				if (!isDiffToolName(toolName)) continue;
				const diff = diffFromToolInput(toolName, part.arguments);
				if (diff) addDiffStats(totals, diff);
			}
		}

		if (msg.role === "toolResult") {
			const toolName = msg.toolName ?? msg.name;
			if (!isDiffToolName(toolName)) continue;
			const diff = extractDiffFromToolResult(msg);
			if (diff) addDiffStats(totals, diff);
		}
	}
	return totals;
}
