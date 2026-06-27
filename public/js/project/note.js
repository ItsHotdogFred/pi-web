import { app } from "../state/store.js";
import {
	projectNoteModalEl,
	projectNoteBackdropEl,
	projectNoteCloseEl,
	projectNoteInputEl,
	projectNotePathEl,
	projectNoteStatusEl,
	projectNoteTitleEl,
} from "../dom/elements.js";
import { basename } from "../utils/format.js";
import { createModal } from "../ui/modal.js";

const SAVE_DEBOUNCE_MS = 500;
let noteLoadedCwd = "";
let noteDirty = false;
let noteSaveTimer = null;
let noteSaveRequestId = 0;

let projectNoteModal = null;

function getProjectNoteModal() {
	if (!projectNoteModal && projectNoteModalEl) {
		projectNoteModal = createModal({
			el: projectNoteModalEl,
			backdropEl: projectNoteBackdropEl,
			onClose: () => {
				void closeProjectNote();
			},
		});
	}
	return projectNoteModal;
}

function setNoteStatus(text) {
	if (projectNoteStatusEl) projectNoteStatusEl.textContent = text;
}

async function fetchProjectNote(cwd) {
	const params = new URLSearchParams();
	if (cwd) params.set("cwd", cwd);
	const query = params.toString();
	const response = await fetch(`/api/note${query ? `?${query}` : ""}`);
	if (!response.ok) {
		const payload = await response.json().catch(() => ({}));
		throw new Error(payload.message || "Failed to load project note");
	}
	return response.json();
}

async function saveProjectNote(cwd, content) {
	const params = new URLSearchParams();
	if (cwd) params.set("cwd", cwd);
	const query = params.toString();
	const response = await fetch(`/api/note${query ? `?${query}` : ""}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});
	if (!response.ok) {
		const payload = await response.json().catch(() => ({}));
		throw new Error(payload.message || "Failed to save project note");
	}
	return response.json();
}

function flushNoteSave() {
	if (noteSaveTimer) {
		clearTimeout(noteSaveTimer);
		noteSaveTimer = null;
	}
	if (!noteDirty || !getProjectNoteModal()?.isOpen()) return Promise.resolve();
	return persistNote();
}

async function persistNote() {
	if (!projectNoteInputEl) return;
	const cwd = app.session.cwd || app.project.gitInfo.path;
	if (!cwd) return;

	const content = projectNoteInputEl.value;
	const requestId = ++noteSaveRequestId;
	noteDirty = false;
	setNoteStatus("Saving…");

	try {
		const payload = await saveProjectNote(cwd, content);
		if (requestId !== noteSaveRequestId || !getProjectNoteModal()?.isOpen()) return;
		if (projectNotePathEl && payload.path) {
			projectNotePathEl.textContent = payload.path;
		}
		setNoteStatus("Saved");
	} catch (error) {
		if (requestId !== noteSaveRequestId || !getProjectNoteModal()?.isOpen()) return;
		noteDirty = true;
		const message = error instanceof Error ? error.message : "Could not save";
		setNoteStatus(message);
	}
}

function scheduleNoteSave() {
	noteDirty = true;
	setNoteStatus("Unsaved changes");
	clearTimeout(noteSaveTimer);
	noteSaveTimer = setTimeout(() => {
		noteSaveTimer = null;
		void persistNote();
	}, SAVE_DEBOUNCE_MS);
}

async function loadNoteIntoModal(cwd) {
	if (!projectNoteInputEl) return;

	setNoteStatus("Loading…");
	projectNoteInputEl.disabled = true;

	try {
		const payload = await fetchProjectNote(cwd);
		noteLoadedCwd = cwd;
		noteDirty = false;
		projectNoteInputEl.value = payload.content ?? "";
		if (projectNoteTitleEl) {
			projectNoteTitleEl.textContent = `Project note · ${basename(cwd)}`;
		}
		if (projectNotePathEl) {
			projectNotePathEl.textContent = payload.path ?? "";
		}
		setNoteStatus(payload.exists ? "Saved" : "New note");
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not load note";
		setNoteStatus(message);
		projectNoteInputEl.value = "";
	} finally {
		projectNoteInputEl.disabled = false;
	}
}

async function openProjectNote() {
	if (!projectNoteModalEl || !projectNoteInputEl) return;

	const cwd = app.session.cwd || app.project.gitInfo.path;
	if (!cwd) {
		setNoteStatus("Pick a project first");
		return;
	}

	getProjectNoteModal()?.open();

	if (cwd !== noteLoadedCwd) {
		await loadNoteIntoModal(cwd);
	}

	projectNoteInputEl.focus();
}

async function closeProjectNote() {
	if (!getProjectNoteModal()?.isOpen()) return;
	await flushNoteSave();
	getProjectNoteModal()?.close();
	noteLoadedCwd = "";
}

export function toggleProjectNote() {
	if (getProjectNoteModal()?.isOpen()) {
		void closeProjectNote();
	} else {
		void openProjectNote();
	}
}

export function reloadProjectNoteIfOpen() {
	if (!getProjectNoteModal()?.isOpen()) return;
	noteLoadedCwd = "";
	void loadNoteIntoModal(app.session.cwd || app.project.gitInfo.path);
}

export function initProjectNote() {
	projectNoteCloseEl?.addEventListener("click", () => {
		void closeProjectNote();
	});

	projectNoteInputEl?.addEventListener("input", () => {
		scheduleNoteSave();
	});
}
