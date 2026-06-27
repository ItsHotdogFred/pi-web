import { app } from "../state/store.js";
import { LANG_TAGS } from "../config.js";
import {
	diffReviewModalEl,
	diffReviewBackdropEl,
	diffReviewCloseEl,
	diffReviewCountEl,
	diffReviewFilesEl,
	diffReviewPathEl,
	diffReviewContentEl,
} from "../dom/elements.js";
import { basename, escapeHtml } from "../utils/format.js";
import { renderDiffView } from "../utils/diff.js";
import { createModal } from "../ui/modal.js";
import { resolveAbsolutePath } from "./fileContext.js";

let diffReviewModal = null;
let selectedPath = null;

function fileLangTag(path) {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	return LANG_TAGS[ext] || ext.toUpperCase().slice(0, 4) || "FILE";
}

function getDiffReviewModal() {
	if (!diffReviewModal && diffReviewModalEl) {
		diffReviewModal = createModal({
			el: diffReviewModalEl,
			backdropEl: diffReviewBackdropEl,
		});
	}
	return diffReviewModal;
}

function sortedDiffPaths() {
	return [...app.chat.fileDiffs.keys()].sort((a, b) => a.localeCompare(b));
}

function renderFileList() {
	if (!diffReviewFilesEl) return;

	const paths = sortedDiffPaths();
	diffReviewFilesEl.replaceChildren();

	for (const path of paths) {
		const li = document.createElement("li");
		li.className = "diff-review-file";
		if (path === selectedPath) li.classList.add("active");
		li.setAttribute("role", "option");
		li.setAttribute("aria-selected", String(path === selectedPath));
		li.tabIndex = path === selectedPath ? 0 : -1;
		li.dataset.path = path;
		li.title = resolveAbsolutePath(path);
		li.innerHTML = `
			<span class="diff-review-file-lang">${fileLangTag(path)}</span>
			<span class="diff-review-file-name">${escapeHtml(basename(path))}</span>`;
		li.addEventListener("click", () => selectFile(path));
		diffReviewFilesEl.appendChild(li);
	}
}

function renderDiffPane(path) {
	if (!diffReviewContentEl || !diffReviewPathEl) return;

	const diff = app.chat.fileDiffs.get(path);
	if (diffReviewPathEl) {
		diffReviewPathEl.textContent = resolveAbsolutePath(path);
	}
	diffReviewContentEl.innerHTML = diff ? renderDiffView(diff) : '<p class="diff-review-empty">No diff available</p>';
}

function selectFile(path) {
	selectedPath = path;
	renderFileList();
	renderDiffPane(path);
	diffReviewFilesEl?.querySelector(`.diff-review-file[data-path="${CSS.escape(path)}"]`)?.focus();
}

function onFileListKeydown(event) {
	if (!diffReviewFilesEl) return;

	const paths = sortedDiffPaths();
	const index = paths.indexOf(selectedPath);
	if (index < 0) return;

	let nextIndex = index;
	if (event.key === "ArrowDown" || event.key === "j") {
		event.preventDefault();
		nextIndex = Math.min(index + 1, paths.length - 1);
	} else if (event.key === "ArrowUp" || event.key === "k") {
		event.preventDefault();
		nextIndex = Math.max(index - 1, 0);
	} else {
		return;
	}

	if (nextIndex !== index) selectFile(paths[nextIndex]);
}

export function openDiffReview() {
	if (!diffReviewModalEl || app.chat.fileDiffs.size === 0) return;

	const paths = sortedDiffPaths();
	selectedPath = paths[0] ?? null;

	if (diffReviewCountEl) {
		const count = paths.length;
		diffReviewCountEl.textContent = `${count} file${count === 1 ? "" : "s"}`;
	}

	renderFileList();
	if (selectedPath) renderDiffPane(selectedPath);

	getDiffReviewModal()?.open();
	diffReviewFilesEl?.querySelector(".diff-review-file.active")?.focus();
}

export function initDiffReview() {
	diffReviewCloseEl?.addEventListener("click", () => getDiffReviewModal()?.close());
	diffReviewFilesEl?.addEventListener("keydown", onFileListKeydown);
}
