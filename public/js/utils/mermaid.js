import { escapeHtml } from "./format.js";

let mermaidInitPromise = null;
let diagramId = 0;
const pendingRenders = [];
let renderTimer = null;

function resolveMermaidApi() {
	const candidates = [
		window.mermaid,
		globalThis.mermaid,
		window.__esbuild_esm_mermaid_nm?.mermaid?.default,
		window.__esbuild_esm_mermaid_nm?.mermaid,
	];
	for (const candidate of candidates) {
		if (candidate?.render && candidate?.initialize) return candidate;
		if (candidate?.default?.render) return candidate.default;
	}
	return null;
}

function getMermaidTheme() {
	return document.documentElement.dataset.theme === "light" ? "default" : "dark";
}

function ensureMermaidInitialized() {
	if (mermaidInitPromise) return mermaidInitPromise;
	const mermaid = resolveMermaidApi();
	if (!mermaid) {
		mermaidInitPromise = Promise.resolve(null);
		return mermaidInitPromise;
	}
	mermaidInitPromise = (async () => {
		try {
			await mermaid.initialize({
				startOnLoad: false,
				theme: getMermaidTheme(),
				securityLevel: "strict",
			});
			return mermaid;
		} catch {
			mermaidInitPromise = null;
			return null;
		}
	})();
	return mermaidInitPromise;
}

function isMermaidPre(pre) {
	if (pre.closest(".mermaid-diagram, .code-block")) return false;
	const code = pre.querySelector("code");
	if (!code) return false;
	const cls = code.className ?? "";
	return /\blanguage-mermaid\b/.test(cls) || /\bmermaid\b/.test(cls);
}

function showSourceFallback(div, source, { errorMessage } = {}) {
	div.classList.add("mermaid-diagram--fallback");
	let html = `<pre class="mermaid-fallback"><code class="language-mermaid">${escapeHtml(source)}</code></pre>`;
	if (errorMessage) {
		html += `<p class="mermaid-error-msg">${escapeHtml(errorMessage)}</p>`;
	}
	div.innerHTML = html;
}

async function renderDiagram(div, source) {
	if (div.dataset.mermaidRendered === "1") return;

	try {
		const mermaid = await ensureMermaidInitialized();
		if (!mermaid) {
			showSourceFallback(div, source);
			div.dataset.mermaidRendered = "1";
			return;
		}

		const id = `mermaid-diagram-${++diagramId}`;
		const { svg } = await mermaid.render(id, source);
		if (!div.isConnected) return;
		div.innerHTML = svg;
		div.dataset.mermaidRendered = "1";
	} catch (err) {
		if (!div.isConnected) {
			showSourceFallback(div, source, { errorMessage: err?.message ?? "Diagram render failed" });
			div.dataset.mermaidRendered = "1";
			return;
		}
		div.classList.add("mermaid-diagram--error");
		showSourceFallback(div, source, { errorMessage: err?.message ?? "Diagram render failed" });
		div.dataset.mermaidRendered = "1";
	}
}

function flushRenderQueue() {
	if (pendingRenders.length === 0) return;
	const batch = pendingRenders.splice(0, pendingRenders.length);
	for (const { div, source } of batch) {
		void renderDiagram(div, source);
	}
}

function scheduleRender(div, source) {
	pendingRenders.push({ div, source });
	if (renderTimer !== null) return;
	renderTimer = setTimeout(() => {
		renderTimer = null;
		flushRenderQueue();
	}, 0);
}

export function enhanceMermaidBlocks(container) {
	if (!container) return;

	for (const pre of container.querySelectorAll("pre")) {
		if (!isMermaidPre(pre)) continue;

		const code = pre.querySelector("code");
		const source = (code?.textContent ?? "").trim();
		if (!source) continue;

		const div = document.createElement("div");
		div.className = "mermaid-diagram";
		div.dataset.mermaidSource = source;
		pre.replaceWith(div);
		scheduleRender(div, source);
	}
}

export function onThemeChange() {
	mermaidInitPromise = null;
	for (const div of document.querySelectorAll(".mermaid-diagram[data-mermaid-source]")) {
		const source = div.dataset.mermaidSource;
		if (!source) continue;
		delete div.dataset.mermaidRendered;
		div.classList.remove("mermaid-diagram--fallback", "mermaid-diagram--error");
		div.replaceChildren();
		scheduleRender(div, source);
	}
}
