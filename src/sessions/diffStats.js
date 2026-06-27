import {
	looksLikeUnifiedDiff,
	buildWriteDiff,
	buildEditDiffFromInput,
	isDiffToolName,
} from "../../public/js/shared/diffCore.js";
import { parseToolPayload, parseRawObject } from "../../public/js/utils/payload.js";

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
