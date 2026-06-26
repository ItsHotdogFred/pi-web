import { escapeHtml } from "./format.js";

const BLOCKED_TAGS = new Set(["script", "iframe", "object", "embed", "form", "meta", "link", "base", "style"]);
const URL_ATTRS = new Set(["href", "src", "xlink:href", "formaction", "action"]);
const DANGEROUS_URL = /^\s*(javascript|vbscript|data:text\/html)/i;

function sanitizeHtml(html) {
	if (!html) return "";
	const doc = new DOMParser().parseFromString(html, "text/html");

	function walk(node) {
		if (node.nodeType !== Node.ELEMENT_NODE) return;

		const tag = node.tagName.toLowerCase();
		if (BLOCKED_TAGS.has(tag)) {
			node.remove();
			return;
		}

		for (const attr of [...node.attributes]) {
			const name = attr.name.toLowerCase();
			if (name.startsWith("on")) {
				node.removeAttribute(attr.name);
			} else if (URL_ATTRS.has(name) && DANGEROUS_URL.test(attr.value)) {
				node.removeAttribute(attr.name);
			}
		}

		for (const child of [...node.childNodes]) {
			if (child.nodeType === Node.ELEMENT_NODE) walk(child);
		}
	}

	for (const child of [...doc.body.childNodes]) {
		if (child.nodeType === Node.ELEMENT_NODE) walk(child);
	}

	return doc.body.innerHTML;
}

export function renderMarkdown(text) {
	if (window.marked?.parse) {
		return sanitizeHtml(window.marked.parse(text, { breaks: true }));
	}
	return escapeHtml(text).replaceAll("\n", "<br>");
}
