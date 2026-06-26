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

const COPY_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="code-copy-icon"><rect x="5.5" y="4.5" width="7" height="8" rx="1" stroke="currentColor" stroke-width="1.25"/><path d="M4.5 4.5V4a1.5 1.5 0 0 1 1.5-1.5H9.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>`;

function showCopiedFeedback(btn) {
	btn.classList.add("copied");
	btn.setAttribute("aria-label", "Copied");
	clearTimeout(btn._copyResetTimer);
	btn._copyResetTimer = setTimeout(() => {
		btn.classList.remove("copied");
		btn.setAttribute("aria-label", "Copy code");
	}, 1500);
}

async function copyCodeText(btn, codeEl) {
	const text = codeEl.textContent ?? "";
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		const area = document.createElement("textarea");
		area.value = text;
		area.setAttribute("readonly", "");
		area.style.position = "fixed";
		area.style.left = "-9999px";
		document.body.appendChild(area);
		area.select();
		document.execCommand("copy");
		area.remove();
	}
	showCopiedFeedback(btn);
}

export function enhanceAssistantCodeBlocks(container) {
	if (!container) return;

	for (const pre of container.querySelectorAll("pre")) {
		if (pre.closest(".code-block")) continue;
		const code = pre.querySelector("code");
		if (!code) continue;

		const wrapper = document.createElement("div");
		wrapper.className = "code-block";

		const header = document.createElement("div");
		header.className = "code-block-header";

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "icon-btn code-copy-btn";
		btn.setAttribute("aria-label", "Copy code");
		btn.innerHTML = `${COPY_ICON}<span class="code-copy-label" aria-hidden="true">Copied</span>`;
		btn.addEventListener("click", () => copyCodeText(btn, code));

		header.appendChild(btn);
		pre.replaceWith(wrapper);
		wrapper.append(header, pre);
	}
}
