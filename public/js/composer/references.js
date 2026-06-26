import { app } from "../state/store.js";
import {
	inlineFileRefsEl,
	inlineFileRefsListEl,
	chatInlineFileRefsEl,
	chatInlineFileRefsListEl,
	inputEl,
	chatInputEl,
} from "../dom/elements.js";
import { animateEnter } from "../utils/animation.js";
import { escapeHtml } from "../utils/format.js";
import { getActiveInput } from "../chat/messages.js";

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
	const cwd = app.cwd || app.gitInfo?.path || "";
	if (app.projectFiles?.cwd === cwd && Array.isArray(app.projectFiles.entries)) {
		return app.projectFiles.entries;
	}

	try {
		const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
		const res = await fetch(`/api/files${query}`);
		if (!res.ok) return [];
		const data = await res.json();
		app.projectFiles = { cwd: data.cwd ?? cwd, entries: data.files ?? [] };
		return app.projectFiles.entries;
	} catch {
		return [];
	}
}

export function invalidateProjectFiles() {
	app.projectFiles = null;
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

function updateFileReferencesFor(targetInput, containerEl, listEl) {
	if (targetInput.value.startsWith("/")) {
		containerEl.classList.remove("is-open");
		containerEl.setAttribute("aria-hidden", "true");
		return;
	}

	const cursor = targetInput.selectionStart ?? targetInput.value.length;
	const context = mentionContext(targetInput.value, cursor);
	const show = context !== null;
	const wasHidden = !containerEl.classList.contains("is-open");

	containerEl.classList.toggle("is-open", show);
	containerEl.setAttribute("aria-hidden", String(!show));

	if (!show) {
		listEl.classList.remove("anim-fade-down");
		listEl.replaceChildren();
		return;
	}

	if (wasHidden) animateEnter(listEl, "anim-fade-down");

	void fetchProjectFiles().then((entries) => {
		if (!containerEl.classList.contains("is-open")) return;
		renderFilesInto(listEl, entries, context.filter, (entry) =>
			insertReference(targetInput, context, entry),
		);
	});
}

export function updateInlineFileReferences() {
	updateFileReferencesFor(inputEl, inlineFileRefsEl, inlineFileRefsListEl);
}

export function updateChatFileReferences() {
	updateFileReferencesFor(chatInputEl, chatInlineFileRefsEl, chatInlineFileRefsListEl);
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
	for (const [containerEl, listEl] of [
		[inlineFileRefsEl, inlineFileRefsListEl],
		[chatInlineFileRefsEl, chatInlineFileRefsListEl],
	]) {
		containerEl?.classList.remove("is-open");
		containerEl?.setAttribute("aria-hidden", "true");
		listEl?.classList.remove("anim-fade-down");
		listEl?.replaceChildren();
	}
}
