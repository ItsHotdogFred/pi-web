import { app } from "../state/store.js";
import { COMPOSER_SCOPES } from "../config.js";
import { $ } from "../dom/elements.js";
import { escapeHtml } from "../utils/format.js";
import { getActiveInput } from "../chat/messages.js";
import { createInlinePicker } from "./inlineList.js";

function mentionContext(text, cursorPos) {
	const before = text.slice(0, cursorPos);
	const atIndex = before.lastIndexOf("@");
	if (atIndex < 0) return null;

	const prefix = before.slice(0, atIndex);
	if (prefix.length > 0 && !/\s$/.test(prefix)) return null;

	const filter = before.slice(atIndex + 1);
	if (/\s/.test(filter)) return null;

	return { filter, start: atIndex, end: cursorPos };
}

function filteredFiles(entries, filter) {
	const q = filter.trim().toLowerCase();
	if (!q) return entries.slice(0, 80);
	return entries
		.filter(({ path }) => path.toLowerCase().includes(q))
		.slice(0, 80);
}

export async function fetchProjectFiles() {
	const cwd = app.session.cwd || app.project.gitInfo?.path || "";
	if (app.composer.projectFiles?.cwd === cwd && Array.isArray(app.composer.projectFiles.entries)) {
		return app.composer.projectFiles.entries;
	}

	try {
		const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
		const res = await fetch(`/api/files${query}`);
		if (!res.ok) return [];
		const data = await res.json();
		app.composer.projectFiles = { cwd: data.cwd ?? cwd, entries: data.files ?? [] };
		return app.composer.projectFiles.entries;
	} catch {
		return [];
	}
}

export function invalidateProjectFiles() {
	app.composer.projectFiles = null;
}

function insertReference(targetInput, context, entry) {
	const ref = entry.type === "dir" ? `@${entry.path}/` : `@${entry.path}`;
	const before = targetInput.value.slice(0, context.start);
	const after = targetInput.value.slice(context.end);
	targetInput.value = `${before}${ref} ${after}`.replace(/  +/g, " ");
	const pos = before.length + ref.length + 1;
	targetInput.setSelectionRange(pos, pos);
	targetInput.dispatchEvent(new Event("input"));
	targetInput.focus();
}

function renderFilesInto(listEl, entries, filter, onSelect) {
	const matches = filteredFiles(entries, filter);
	listEl.replaceChildren();

	if (matches.length === 0) {
		const empty = document.createElement("li");
		empty.innerHTML = `<button type="button" disabled><span class="command-desc">${escapeHtml(entries.length ? "No matching files" : "Loading project files…")}</span></button>`;
		listEl.appendChild(empty);
		return;
	}

	for (const entry of matches) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		const kind = entry.type === "dir" ? "folder" : "file";
		btn.innerHTML = `<span class="command-name">@${escapeHtml(entry.path)}${entry.type === "dir" ? "/" : ""}</span><span class="command-desc file-ref-kind">${kind}</span>`;
		btn.addEventListener("click", () => onSelect(entry));
		li.appendChild(btn);
		listEl.appendChild(li);
	}
}

function createFileRefsPicker(scope) {
	const containerEl = $(scope.inlineFileRefsId);
	const listEl = $(scope.inlineFileRefsListId);
	if (!containerEl || !listEl) return null;

	let mention = null;

	return createInlinePicker({
		containerEl,
		listEl,
		shouldShow(input) {
			if (input.value.startsWith("/")) return false;
			const cursor = input.selectionStart ?? input.value.length;
			mention = mentionContext(input.value, cursor);
			return mention !== null;
		},
		getFilter() {
			return mention?.filter ?? "";
		},
		fetchItems() {
			return fetchProjectFiles();
		},
		renderItems(listEl, entries, onSelect) {
			renderFilesInto(listEl, entries, mention?.filter ?? "", onSelect);
		},
		onSelect(entry, input) {
			if (mention) insertReference(input, mention, entry);
		},
	});
}

const pickersByScope = new Map();

function getFileRefsPicker(scope) {
	if (!pickersByScope.has(scope)) {
		pickersByScope.set(scope, createFileRefsPicker(scope));
	}
	return pickersByScope.get(scope);
}

export function updateFileReferencesForScope(scope) {
	const inputEl = $(scope.inputId);
	const picker = getFileRefsPicker(scope);
	if (!inputEl || !picker) return;
	picker.update(inputEl);
}

export function updateInlineFileReferences() {
	updateFileReferencesForScope(COMPOSER_SCOPES.dashboard);
}

export function updateChatFileReferences() {
	updateFileReferencesForScope(COMPOSER_SCOPES.chat);
}

export function openFileReferences(targetInput = getActiveInput()) {
	targetInput.focus();
	const pos = targetInput.selectionStart ?? targetInput.value.length;
	const before = targetInput.value.slice(0, pos);
	const after = targetInput.value.slice(pos);
	const needsSpace = before.length > 0 && !/\s$/.test(before);
	targetInput.value = `${before}${needsSpace ? " " : ""}@${after}`;
	const atPos = before.length + (needsSpace ? 1 : 0) + 1;
	targetInput.setSelectionRange(atPos, atPos);
	targetInput.dispatchEvent(new Event("input"));
}

export function closeFileReferences() {
	for (const scope of Object.values(COMPOSER_SCOPES)) {
		getFileRefsPicker(scope)?.close();
	}
}
