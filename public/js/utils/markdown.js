import { escapeHtml } from "./format.js";

export function renderMarkdown(text) {
	if (window.marked?.parse) {
		return window.marked.parse(text, { breaks: true });
	}
	return escapeHtml(text).replaceAll("\n", "<br>");
}
