import { app } from "../state/store.js";
import { MODEL_SCOPES } from "../config.js";
import { $, modelLabelEl } from "../dom/elements.js";
import { requestAgentDefaults } from "../notifications/prompt.js";
import { renderProjectMenu, sendProjectPath, clearProjectPathError } from "../project/menu.js";
import { setupModelSearch, renderModelMenu, openModelDropdown } from "./models.js";

export function closeAllDropdowns() {
	document.querySelectorAll(".dropdown-menu").forEach((menu) => menu.classList.add("hidden"));
	document.querySelectorAll(".dropdown.is-open").forEach((dropdown) => dropdown.classList.remove("is-open"));
	app.modelSearchQuery = "";
	for (const scope of Object.values(MODEL_SCOPES)) {
		const search = $(scope.searchId);
		if (search) search.value = "";
	}
}

export function initDropdowns() {
	setupModelSearch();
	renderModelMenu();

	$("model-trigger")?.addEventListener("click", (e) => {
		e.stopPropagation();
		openModelDropdown("dashboard");
	});
	$("model-menu")?.addEventListener("click", (e) => e.stopPropagation());

	$("chat-model-trigger")?.addEventListener("click", (e) => {
		e.stopPropagation();
		openModelDropdown("chat");
	});
	$("chat-model-menu")?.addEventListener("click", (e) => e.stopPropagation());

	$("project-trigger")?.addEventListener("click", (e) => {
		e.stopPropagation();
		const menu = $("project-menu");
		const dropdown = $("project-dropdown");
		if (!menu || !dropdown) return;
		const wasOpen = !menu.classList.contains("hidden");
		closeAllDropdowns();
		if (!wasOpen) {
			renderProjectMenu();
			menu.classList.remove("hidden");
			dropdown.classList.add("is-open");
		}
	});
	$("project-menu")?.addEventListener("click", (e) => e.stopPropagation());
	$("project-path-form")?.addEventListener("submit", (e) => {
		e.preventDefault();
		const input = $("project-path-input");
		if (!input) return;
		const path = input.value;
		sendProjectPath(path);
		if (path.trim()) input.value = "";
	});
	$("project-path-input")?.addEventListener("input", clearProjectPathError);

	document.addEventListener("click", closeAllDropdowns);
}
