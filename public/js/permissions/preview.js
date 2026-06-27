import {
	formatRaw,
	parseToolPayload,
	buildEditDiffFromInput,
	buildWriteDiff,
	renderDiffView,
	looksLikeUnifiedDiff,
	escapeHtml,
} from "../utils/format.js";
import { normalizeToolName } from "../utils/tools.js";

const DIFF_TOOL_PATTERN = /^(edit|write|patch|replace|create)$/;
const SHELL_TOOL_PATTERN = /^(shell|bash)$/;

function permissionToolName(tool) {
	if (!tool || typeof tool !== "object") return "tool";
	return (
		normalizeToolName(tool.title) ||
		normalizeToolName(tool.kind) ||
		normalizeToolName(tool.toolName) ||
		"tool"
	);
}

function summarizeRawInput(rawInput) {
	if (rawInput == null) return "";
	const text = formatRaw(rawInput);
	if (!text) return "";
	const lines = text.split("\n");
	if (lines.length > 6) return `${lines.slice(0, 6).join("\n")}\n…`;
	if (text.length > 400) return `${text.slice(0, 400)}…`;
	return text;
}

function extractShellCommand(rawInput) {
	const input = parseToolPayload(rawInput);
	if (!input || typeof input !== "object") return "";
	return String(input.command ?? input.cmd ?? "").trim();
}

function extractDiffFromRawInput(rawInput, toolName) {
	const input = parseToolPayload(rawInput);
	if (input) {
		const editDiff = buildEditDiffFromInput(input);
		if (editDiff) return editDiff;

		const writeContent = input.content ?? input.text;
		if ((toolName === "write" || toolName === "create") && writeContent != null) {
			return buildWriteDiff({ ...input, content: writeContent });
		}
	}

	const formatted = formatRaw(rawInput);
	if (looksLikeUnifiedDiff(formatted)) return formatted;

	return null;
}

export function buildPermissionPreview(tool) {
	const toolName = permissionToolName(tool).toLowerCase();
	const rawInput = tool?.rawInput;

	if (SHELL_TOOL_PATTERN.test(toolName)) {
		const command = extractShellCommand(rawInput);
		if (command) {
			return {
				type: "command",
				html: `<pre class="permission-command">${escapeHtml(command)}</pre>`,
			};
		}
	}

	if (DIFF_TOOL_PATTERN.test(toolName)) {
		const diff = extractDiffFromRawInput(rawInput, toolName);
		if (diff) {
			return {
				type: "diff",
				html: `<div class="permission-diff-view">${renderDiffView(diff)}</div>`,
			};
		}
	}

	const text = summarizeRawInput(rawInput);
	if (!text) return null;
	return { type: "text", text };
}
