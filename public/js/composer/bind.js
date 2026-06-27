import { COMPOSER_SCOPES } from "../config.js";
import { $, fileInputEl } from "../dom/elements.js";
import { app } from "../state/store.js";
import { setBusy } from "../ui/status.js";
import { sendPrompt } from "../wire/send.js";
import { updateSlashCommandsFor } from "../commands/palette.js";
import { updateFileReferencesForScope, openFileReferences } from "./references.js";
import { resizeTextarea } from "./textarea.js";
import { handleImagePaste } from "./attachments.js";

export function bindComposerScope(scope) {
	const formEl = $(scope.formId);
	const inputEl = $(scope.inputId);
	const attachBtnEl = $(scope.attachBtnId);
	const fileRefBtnEl = $(scope.fileRefBtnId);
	if (!formEl || !inputEl) return;

	formEl.addEventListener("submit", (e) => {
		e.preventDefault();
		sendPrompt(inputEl.value, scope.isChat);
	});

	inputEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			formEl.requestSubmit();
		}
	});

	inputEl.addEventListener("paste", (e) => {
		app.ui.attachTarget = inputEl;
		handleImagePaste(e, inputEl);
	});

	let pickerFrame = null;
	inputEl.addEventListener("input", () => {
		resizeTextarea(inputEl);
		if (!scope.isChat) setBusy(app.ui.busy);
		if (pickerFrame != null) cancelAnimationFrame(pickerFrame);
		pickerFrame = requestAnimationFrame(() => {
			pickerFrame = null;
			const value = inputEl.value;
			const cmdsOpen = $(scope.inlineCommandsId)?.classList.contains("is-open");
			const filesOpen = $(scope.inlineFileRefsId)?.classList.contains("is-open");
			if (value.startsWith("/") || cmdsOpen) updateSlashCommandsFor(scope);
			if (!value.startsWith("/") || filesOpen) updateFileReferencesForScope(scope);
		});
	});

	attachBtnEl?.addEventListener("click", () => {
		app.ui.attachTarget = inputEl;
		fileInputEl.click();
	});

	fileRefBtnEl?.addEventListener("click", () => {
		app.ui.attachTarget = inputEl;
		openFileReferences(inputEl);
	});
}

export function bindAllComposers() {
	for (const scope of Object.values(COMPOSER_SCOPES)) bindComposerScope(scope);
}
