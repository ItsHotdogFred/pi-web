import { app } from "../state/store.js";
import {
	$,
	composerEl,
	chatComposerEl,
	inputEl,
	chatInputEl,
	cancelEl,
	searchBtnEl,
	sidebarSearchEl,
	searchInputEl,
	commandsHintEl,
	attachBtnEl,
	fileInputEl,
	contribGraphLearnEl,
	contribGraphNoteEl,
} from "../dom/elements.js";
import { setBusy } from "../ui/status.js";
import { showView, setNavActive } from "../ui/views.js";
import { renderSessions } from "../dashboard/sessions.js";
import { cycleActivityArtStyle } from "../dashboard/activity.js";
import { sendPrompt } from "../wire/send.js";
import { resizeTextarea } from "../composer/textarea.js";
import { addImageAttachment } from "../composer/attachments.js";
import { updateInlineCommands, updateChatSlashCommands, openCommands, closeCommands } from "../commands/palette.js";
import { renderFileContext } from "../chat/tools.js";

export function bindEvents() {
	composerEl.addEventListener("submit", (e) => {
		e.preventDefault();
		sendPrompt(inputEl.value);
	});

	chatComposerEl.addEventListener("submit", (e) => {
		e.preventDefault();
		sendPrompt(chatInputEl.value, true);
	});

	cancelEl.addEventListener("click", () => {
		if (app.ws?.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify({ type: "cancel" }));
	});

	inputEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			composerEl.requestSubmit();
		}
	});

	inputEl.addEventListener("input", () => {
		resizeTextarea(inputEl);
		setBusy(app.busy);
		updateInlineCommands();
	});

	chatInputEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			chatComposerEl.requestSubmit();
		}
	});

	chatInputEl.addEventListener("input", () => {
		resizeTextarea(chatInputEl);
		updateChatSlashCommands();
	});

	$("nav-dashboard").addEventListener("click", () => {
		setNavActive("dashboard");
		showView("dashboard");
	});

	$("back-to-dashboard").addEventListener("click", () => {
		showView("dashboard");
	});

	searchBtnEl.addEventListener("click", () => {
		sidebarSearchEl.classList.toggle("hidden");
		if (!sidebarSearchEl.classList.contains("hidden")) searchInputEl.focus();
	});

	searchInputEl.addEventListener("input", () => {
		app.searchQuery = searchInputEl.value;
		renderSessions();
	});

	commandsHintEl.addEventListener("click", () => openCommands(inputEl));

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeCommands();
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
			e.preventDefault();
			void cycleActivityArtStyle();
			return;
		}
		if (e.key === "/" && document.activeElement !== inputEl && document.activeElement !== chatInputEl) {
			e.preventDefault();
			openCommands();
		}
	});

	attachBtnEl.addEventListener("click", () => {
		app.attachTarget = inputEl;
		fileInputEl.click();
	});

	$("chat-attach-btn")?.addEventListener("click", () => {
		app.attachTarget = chatInputEl;
		fileInputEl.click();
	});

	fileInputEl.addEventListener("change", () => {
		const file = fileInputEl.files?.[0];
		if (file && app.attachTarget) {
			addImageAttachment(file, app.attachTarget);
			app.attachTarget.focus();
		}
		fileInputEl.value = "";
	});

	$("file-context-toggle")?.addEventListener("click", () => {
		app.fileContextCollapsed = !app.fileContextCollapsed;
		renderFileContext();
	});

	contribGraphLearnEl?.addEventListener("click", () => {
		contribGraphNoteEl?.classList.toggle("hidden");
	});
}
