import { escapeHtml } from "./format.js";
export {
	looksLikeUnifiedDiff,
	buildSyntheticDiff,
	buildWriteDiff,
	buildEditDiffFromInput,
	isDiffToolName,
} from "../shared/diffCore.js";

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
