import { app } from "../state/store.js";
import { LANG_TAGS, EDITOR_PREF_KEY, EDITOR_OPTIONS } from "../config.js";
import { $, fileContextEl } from "../dom/elements.js";
import {
	basename,
	escapeHtml,
	parseToolPayload,
	extractFilePath,
} from "../utils/format.js";
import { resolveToolName } from "../utils/tools.js";
import { animateEnter } from "../utils/animation.js";
import { extractDiffFromTool, scrollToToolDiff } from "./toolDiff.js";
import { openDiffReview } from "./diffReview.js";

export function clearChangedFiles() {
	app.chat.changedFiles.clear();
	app.chat.fileDiffs.clear();
	renderFileContext();
}

function fileLangTag(path) {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	return LANG_TAGS[ext] || ext.toUpperCase().slice(0, 4) || "FILE";
}

export function resolveAbsolutePath(path) {
	if (!path) return "";
	const normalized = String(path).replace(/\\/g, "/");
	if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) return normalized;
	const base = (app.session.cwd || app.project.gitInfo.path || "").replace(/\\/g, "/").replace(/\/$/, "");
	if (!base) return normalized.replace(/^\.\//, "");
	return `${base}/${normalized.replace(/^\.\//, "")}`;
}

function getPreferredEditor() {
	try {
		const stored = localStorage.getItem(EDITOR_PREF_KEY);
		if (stored && EDITOR_OPTIONS.some((option) => option.id === stored)) return stored;
	} catch {
		/* ignore */
	}
	return "cursor";
}

function setPreferredEditor(editorId) {
	try {
		localStorage.setItem(EDITOR_PREF_KEY, editorId);
	} catch {
		/* ignore */
	}
	renderFileContext();
}

function buildEditorUrl(editorId, filePath, line = 1) {
	const abs = resolveAbsolutePath(filePath);
	const path = abs.replace(/\\/g, "/");
	const loc = line > 1 ? `:${line}` : "";
	switch (editorId) {
		case "cursor":
			return `cursor://file/${path}${loc}`;
		case "zed":
			return `zed://file/${path}${loc}`;
		default:
			return `vscode://file/${path}${loc}`;
	}
}

function openInEditor(filePath, line = 1) {
	const url = buildEditorUrl(getPreferredEditor(), filePath, line);
	window.location.href = url;
}

function renderFileContextReviewButton() {
	let btn = fileContextEl?.querySelector(".file-context-review-btn");
	const hasDiffs = app.chat.fileDiffs.size > 0;

	if (!hasDiffs) {
		btn?.remove();
		return;
	}

	const header = fileContextEl?.querySelector(".file-context-header");
	if (!header) return;

	if (!btn) {
		btn = document.createElement("button");
		btn.type = "button";
		btn.className = "file-context-review-btn";
		btn.textContent = "Review changes";
		btn.addEventListener("click", (event) => {
			event.stopPropagation();
			openDiffReview();
		});
		const picker = header.querySelector(".file-context-editor-picker");
		if (picker) header.insertBefore(btn, picker);
		else header.appendChild(btn);
	}
}

function renderFileContextEditorPicker() {
	let picker = fileContextEl?.querySelector(".file-context-editor-picker");
	if (!picker && fileContextEl) {
		const header = fileContextEl.querySelector(".file-context-header");
		if (!header) return;
		picker = document.createElement("div");
		picker.className = "file-context-editor-picker";
		picker.setAttribute("role", "group");
		picker.setAttribute("aria-label", "Open files in");
		picker.addEventListener("click", (event) => event.stopPropagation());
		header.appendChild(picker);
	}

	if (!picker) return;

	const preferred = getPreferredEditor();
	picker.replaceChildren();
	for (const option of EDITOR_OPTIONS) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `file-context-editor-btn${option.id === preferred ? " active" : ""}`;
		btn.textContent = option.label;
		btn.title = `Open files in ${option.label}`;
		btn.addEventListener("click", (event) => {
			event.stopPropagation();
			setPreferredEditor(option.id);
		});
		picker.appendChild(btn);
	}
}

export function trackFileFromTool(state) {
	const toolName = resolveToolName(state).toLowerCase();
	if (!/(write|edit|patch|replace|create|fs)/.test(toolName)) return;

	const payload = parseToolPayload(state.rawInput);
	const path = extractFilePath(payload);
	if (!path) return;

	app.chat.changedFiles.add(path);

	const diff = extractDiffFromTool(state);
	if (diff) app.chat.fileDiffs.set(path, diff);

	renderFileContext();
}

export function renderFileContext() {
	const countEl = $("file-context-count");
	const listEl = $("file-context-list");
	if (!fileContextEl || !countEl || !listEl) return;

	const files = [...app.chat.changedFiles].sort((a, b) => a.localeCompare(b));
	const wasHidden = fileContextEl.classList.contains("hidden");
	if (files.length === 0) {
		fileContextEl.classList.add("hidden");
		return;
	}

	fileContextEl.classList.remove("hidden");
	if (wasHidden) animateEnter(fileContextEl, "anim-fade-up");
	fileContextEl.classList.toggle("collapsed", app.chat.fileContextCollapsed);
	$("file-context-toggle")?.setAttribute("aria-expanded", String(!app.chat.fileContextCollapsed));
	countEl.textContent = `${files.length} File${files.length === 1 ? "" : "s"} Touched`;
	renderFileContextReviewButton();
	renderFileContextEditorPicker();

	listEl.replaceChildren();
	for (const path of files) {
		const li = document.createElement("li");
		li.className = "file-context-item";
		const hasDiff = app.chat.fileDiffs.has(path);

		const fileBtn = document.createElement("button");
		fileBtn.type = "button";
		fileBtn.className = "file-context-file";
		fileBtn.title = resolveAbsolutePath(path);
		fileBtn.innerHTML = `
			<span class="file-context-lang">${fileLangTag(path)}</span>
			<span class="file-context-name">${escapeHtml(basename(path))}</span>`;
		fileBtn.addEventListener("click", () => openInEditor(path));

		const actions = document.createElement("div");
		actions.className = "file-context-actions";

		const openBtn = document.createElement("button");
		openBtn.type = "button";
		openBtn.className = "file-context-action";
		openBtn.textContent = "Open";
		openBtn.title = `Open in ${EDITOR_OPTIONS.find((o) => o.id === getPreferredEditor())?.label ?? "editor"}`;
		openBtn.addEventListener("click", () => openInEditor(path));

		actions.appendChild(openBtn);

		if (hasDiff) {
			const diffBtn = document.createElement("button");
			diffBtn.type = "button";
			diffBtn.className = "file-context-action file-context-action--diff";
			diffBtn.textContent = "Diff";
			diffBtn.addEventListener("click", () => scrollToToolDiff(path));
			actions.appendChild(diffBtn);
		}

		li.append(fileBtn, actions);
		listEl.appendChild(li);
	}
}
