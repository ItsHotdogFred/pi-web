import { escapeHtml } from "./format.js";
import { extractFilePath } from "./payload.js";

export function looksLikeUnifiedDiff(text) {
	if (!text || typeof text !== "string") return false;
	const trimmed = text.trim();
	return /^(\-\-\-|\+\+\+|@@)/m.test(trimmed);
}

export function buildSyntheticDiff(input) {
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

export function buildWriteDiff(input) {
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

export function buildEditDiffFromInput(input) {
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

export function isDiffToolName(name) {
	return /^(edit|write|patch|replace|create)$/.test(String(name ?? "").toLowerCase());
}

export function renderDiffView(diffText) {
	const lines = String(diffText).split("\n");
	let html = '<div class="diff-view" tabindex="0">';
	for (const line of lines) {
		let cls = "diff-line";
		if (line.startsWith("---") || line.startsWith("+++")) cls += " diff-line-meta";
		else if (line.startsWith("@@")) cls += " diff-line-hunk";
		else if (line.startsWith("+")) cls += " diff-line-add";
		else if (line.startsWith("-")) cls += " diff-line-del";
		else cls += " diff-line-ctx";

		const gutter = line.length ? line[0] : " ";
		const body = line.length > 1 ? line.slice(1) : line === "+" || line === "-" ? "" : line;
		html += `<div class="${cls}"><span class="diff-gutter">${escapeHtml(gutter)}</span><code>${escapeHtml(body)}</code></div>`;
	}
	html += "</div>";
	return html;
}
