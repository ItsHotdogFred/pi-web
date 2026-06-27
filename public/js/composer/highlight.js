import { escapeHtml } from "../utils/format.js";

const FILE_REF_RE = /(^|\s)@([^\s@]+)/g;

export function buildComposerHighlightHtml(text) {
	if (!text) return "";

	let html = "";
	let lastIndex = 0;

	for (const match of text.matchAll(FILE_REF_RE)) {
		const [full, prefix, path] = match;
		const matchStart = match.index ?? 0;
		html += escapeHtml(text.slice(lastIndex, matchStart));
		html += escapeHtml(prefix);
		html += `<span class="composer-file-ref">${escapeHtml(path)}</span>`;
		lastIndex = matchStart + full.length;
	}

	html += escapeHtml(text.slice(lastIndex));
	return html;
}

export function syncComposerHighlight(textarea) {
	const highlight = textarea.closest(".composer-input-wrap")?.querySelector(".composer-input-highlight");
	if (!highlight) return;
	highlight.innerHTML = buildComposerHighlightHtml(textarea.value);
	highlight.scrollTop = textarea.scrollTop;
	highlight.scrollLeft = textarea.scrollLeft;
}
