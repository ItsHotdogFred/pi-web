import { app } from "../state/store.js";
import {
	$,
	inputEl,
	cancelEl,
	searchBtnEl,
	sidebarSearchEl,
	searchInputEl,
	commandsHintEl,
	fileInputEl,
	contribGraphLearnEl,
	contribGraphNoteEl,
} from "../dom/elements.js";
import { COMPOSER_SCOPES } from "../config.js";
import { showView, setNavActive } from "../ui/views.js";
import { renderSessions } from "../dashboard/sessions.js";
import { searchSessionsDebounced, clearSessionSearch } from "../dashboard/sessionSearch.js";
import { cycleActivityArtStyle } from "../dashboard/activity.js";
import { reconnect } from "../wire/websocket.js";
import { addImageAttachment } from "../composer/attachments.js";
import { bindAllComposers } from "../composer/bind.js";
import { openCommands, closeCommands } from "../commands/palette.js";
import { renderFileContext } from "../chat/fileContext.js";
import { toggleProjectNote } from "../project/note.js";

const composerInputs = () =>
	Object.values(COMPOSER_SCOPES)
		.map((scope) => $(scope.inputId))
		.filter(Boolean);

export function bindEvents() {
	bindAllComposers();

	cancelEl?.addEventListener("click", () => {
		if (app.connection.ws?.readyState === WebSocket.OPEN) app.connection.ws.send(JSON.stringify({ type: "cancel" }));
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
		app.ui.searchQuery = searchInputEl.value;
		const q = app.ui.searchQuery.trim();
		if (q.length >= 2) searchSessionsDebounced(q);
		else clearSessionSearch();
		renderSessions();
	});

	commandsHintEl.addEventListener("click", () => openCommands(inputEl));

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") closeCommands();
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
			e.preventDefault();
			reconnect();
			return;
		}
		if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
			e.preventDefault();
			void cycleActivityArtStyle();
			return;
		}
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
			e.preventDefault();
			toggleProjectNote();
			return;
		}
		if (e.key === "/" && !composerInputs().includes(document.activeElement)) {
			e.preventDefault();
			openCommands();
		}
	});

	fileInputEl.addEventListener("change", () => {
		const file = fileInputEl.files?.[0];
		if (file && app.ui.attachTarget) {
			addImageAttachment(file, app.ui.attachTarget);
			app.ui.attachTarget.focus();
		}
		fileInputEl.value = "";
	});

	$("file-context-toggle")?.addEventListener("click", () => {
		app.chat.fileContextCollapsed = !app.chat.fileContextCollapsed;
		renderFileContext();
	});

	contribGraphLearnEl?.addEventListener("click", () => {
		contribGraphNoteEl?.classList.toggle("hidden");
	});
}
