import { app } from "../state/store.js";
import { MODEL_SCOPES } from "../config.js";
import { $, modelLabelEl } from "../dom/elements.js";
import { escapeHtml } from "../utils/format.js";
import { requestAgentDefaults } from "../notifications/prompt.js";
import { renderSessions } from "../dashboard/sessions.js";
import { closeAllDropdowns } from "./dropdowns.js";

function currentModelLabel() {
	const match = app.models.find((model) => model.id === app.currentModelId);
	return match?.name || "Model";
}

function syncModelLabels() {
	const label = currentModelLabel();
	if (modelLabelEl) modelLabelEl.textContent = label;
	const chatLabel = $("chat-model-label");
	if (chatLabel) chatLabel.textContent = label;
}

export function filteredModels() {
	const q = app.modelSearchQuery.trim().toLowerCase();
	if (!q) return app.models;
	return app.models.filter(
		(model) =>
			model.name.toLowerCase().includes(q) ||
			model.id.toLowerCase().includes(q) ||
			(model.description && model.description.toLowerCase().includes(q)),
	);
}

export function selectModel(modelId) {
	if (!modelId) {
		closeAllDropdowns();
		return;
	}
	if (modelId !== app.currentModelId) {
		app.currentModelId = modelId;
		app.pendingModelSelection = modelId;
		syncModelLabels();
		renderModelMenuList("model-menu-list");
		renderModelMenuList("chat-model-menu-list");
		if (app.ws?.readyState === WebSocket.OPEN) {
			app.ws.send(JSON.stringify({ type: "set_model", value: modelId }));
		}
	}
	closeAllDropdowns();
}

export function renderModelMenuList(listId = "model-menu-list") {
	const list = $(listId);
	if (!list) return;

	list.replaceChildren();
	const items = filteredModels();

	if (items.length === 0) {
		const empty = document.createElement("div");
		empty.className = "model-menu-empty";
		empty.textContent = app.models.length ? "No models match your search" : "Waiting for Pi models…";
		list.appendChild(empty);
		return;
	}

	for (const model of items) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "dropdown-item" + (model.id === app.currentModelId ? " selected" : "");
		btn.innerHTML = `<span class="model-option-name">${escapeHtml(model.name)}</span>${model.description ? `<span class="model-option-desc">${escapeHtml(model.description)}</span>` : ""}`;
		btn.addEventListener("click", () => selectModel(model.id));
		list.appendChild(btn);
	}
}

export function renderModelMenu() {
	setupModelSearch();
	renderModelMenuList("model-menu-list");
	renderModelMenuList("chat-model-menu-list");
	syncModelLabels();
}

export function setModels(payload) {
	if (payload?.current) {
		if (!app.pendingModelSelection || payload.current === app.pendingModelSelection) {
			app.currentModelId = payload.current;
			if (payload.current === app.pendingModelSelection) app.pendingModelSelection = null;
		}
	}
	if (Array.isArray(payload?.models)) {
		app.models = payload.models;
	}
	renderModelMenu();
	if (Array.isArray(payload?.models)) renderSessions();
}

export function openModelDropdown(scope = "dashboard") {
	const config = MODEL_SCOPES[scope];
	if (!config) return;

	if (app.models.length === 0) requestAgentDefaults();

	const menu = $(config.menuId);
	const dropdown = $(config.dropdownId);
	if (!menu || !dropdown) return;

	const wasOpen = !menu.classList.contains("hidden");
	closeAllDropdowns();
	if (wasOpen) return;

	app.activeModelScope = scope;
	menu.classList.remove("hidden");
	dropdown.classList.add("is-open");
	app.modelSearchQuery = "";
	const modelSearch = $(config.searchId);
	if (modelSearch) modelSearch.value = "";
	renderModelMenuList(config.listId);
	requestAnimationFrame(() => modelSearch?.focus());
}

function setupModelSearchForScope(scope) {
	const config = MODEL_SCOPES[scope];
	const modelSearch = $(config.searchId);
	if (!modelSearch || modelSearch.dataset.ready) return;
	modelSearch.dataset.ready = "1";

	modelSearch.addEventListener("input", () => {
		clearTimeout(app.modelSearchTimer);
		app.modelSearchTimer = setTimeout(() => {
			app.activeModelScope = scope;
			app.modelSearchQuery = modelSearch.value;
			renderModelMenuList(config.listId);
		}, 120);
	});

	modelSearch.addEventListener("click", (e) => e.stopPropagation());
	modelSearch.addEventListener("keydown", (e) => {
		e.stopPropagation();
		if (e.key === "Enter") {
			e.preventDefault();
			const first = filteredModels()[0];
			if (first) selectModel(first.id);
		}
	});
}

export function setupModelSearch() {
	for (const scope of Object.keys(MODEL_SCOPES)) {
		setupModelSearchForScope(scope);
	}
}
