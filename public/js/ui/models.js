import { app } from "../state/store.js";
import { MODEL_SCOPES, MODEL_FAVOURITES_KEY, MODEL_FAVS_ONLY_KEY } from "../config.js";
import { $, modelLabelEl } from "../dom/elements.js";
import { escapeHtml } from "../utils/format.js";
import { requestAgentDefaults } from "../notifications/prompt.js";
import { renderSessions } from "../dashboard/sessions.js";
import { closeAllDropdowns } from "./dropdowns.js";

function loadFavourites() {
	try {
		const stored = JSON.parse(localStorage.getItem(MODEL_FAVOURITES_KEY) || "[]");
		if (Array.isArray(stored)) app.models.favourites = new Set(stored);
	} catch {
		/* ignore */
	}
	try {
		app.models.favouritesOnly = localStorage.getItem(MODEL_FAVS_ONLY_KEY) === "1";
	} catch {
		/* ignore */
	}
}

function saveFavourites() {
	try {
		localStorage.setItem(MODEL_FAVOURITES_KEY, JSON.stringify([...app.models.favourites]));
	} catch {
		/* ignore */
	}
}

function saveFavsOnly() {
	try {
		localStorage.setItem(MODEL_FAVS_ONLY_KEY, app.models.favouritesOnly ? "1" : "0");
	} catch {
		/* ignore */
	}
}

function currentModelLabel() {
	const match = app.models.list.find((model) => model.id === app.models.currentModelId);
	return match?.name || "Model";
}

function syncModelLabels() {
	const label = currentModelLabel();
	if (modelLabelEl) modelLabelEl.textContent = label;
	const chatLabel = $("chat-model-label");
	if (chatLabel) chatLabel.textContent = label;
}

function filteredModels() {
	const q = app.models.searchQuery.trim().toLowerCase();
	let items = app.models.list;
	if (app.models.favouritesOnly) items = items.filter((m) => app.models.favourites.has(m.id));
	if (!q) return items;
	return items.filter(
		(model) =>
			model.name.toLowerCase().includes(q) ||
			model.id.toLowerCase().includes(q) ||
			(model.description && model.description.toLowerCase().includes(q)),
	);
}

function selectModel(modelId) {
	if (!modelId) {
		closeAllDropdowns();
		return;
	}
	if (modelId !== app.models.currentModelId) {
		app.models.currentModelId = modelId;
		app.models.pendingModelSelection = modelId;
		syncModelLabels();
		renderModelMenuList("model-menu-list");
		renderModelMenuList("chat-model-menu-list");
		if (app.connection.ws?.readyState === WebSocket.OPEN) {
			app.connection.ws.send(JSON.stringify({ type: "set_model", value: modelId }));
		}
	}
	closeAllDropdowns();
}

function toggleFavourite(modelId, btn) {
	if (app.models.favourites.has(modelId)) app.models.favourites.delete(modelId);
	else app.models.favourites.add(modelId);
	saveFavourites();
	// Update the star icon in-place for snappy feedback, and re-render lists.
	updateFavButton(btn, modelId);
	renderModelMenuList("model-menu-list");
	renderModelMenuList("chat-model-menu-list");
	updateFavToggleHeaders();
}

function updateFavButton(btn, modelId) {
	if (!btn) return;
	const active = app.models.favourites.has(modelId);
	btn.classList.toggle("is-active", active);
	btn.title = active ? "Remove from favourites" : "Add to favourites";
	btn.setAttribute("aria-pressed", active ? "true" : "false");
}

function updateFavToggleHeaders() {
	for (const id of ["model-menu-favs-toggle", "chat-model-menu-favs-toggle"]) {
		const el = $(id);
		if (!el) continue;
		el.classList.toggle("is-active", app.models.favouritesOnly);
		el.textContent = app.models.favouritesOnly ? "★ Favourites only" : "★ Favourites";
	}
}

function buildMenuHeader(listEl) {
	// Insert a header with the favourites-only toggle above the list, once per list.
	const list = listEl;
	const parent = list.parentElement;
	if (!parent || parent.querySelector(".model-menu-header")) return;
	const header = document.createElement("div");
	header.className = "model-menu-header";
	const toggle = document.createElement("button");
	toggle.type = "button";
	toggle.className = "model-menu-favs-toggle";
	toggle.id = list.id === "chat-model-menu-list" ? "chat-model-menu-favs-toggle" : "model-menu-favs-toggle";
	toggle.addEventListener("click", (e) => {
		e.stopPropagation();
		app.models.favouritesOnly = !app.models.favouritesOnly;
		saveFavsOnly();
		updateFavToggleHeaders();
		renderModelMenuList("model-menu-list");
		renderModelMenuList("chat-model-menu-list");
	});
	header.appendChild(toggle);
	parent.insertBefore(header, list);
	updateFavToggleHeaders();
}

function renderModelMenuList(listId = "model-menu-list") {
	const list = $(listId);
	if (!list) return;
	buildMenuHeader(list);

	list.replaceChildren();
	const items = filteredModels();

	if (items.length === 0) {
		const empty = document.createElement("div");
		empty.className = "model-menu-empty";
		empty.textContent = app.models.list.length
			? app.models.favouritesOnly
				? "No favourite models yet — tap ★ on a model"
				: "No models match your search"
			: "Waiting for Pi models…";
		list.appendChild(empty);
		return;
	}

	for (const model of items) {
		const row = document.createElement("div");
		row.className = "model-menu-item";

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "dropdown-item" + (model.id === app.models.currentModelId ? " selected" : "");
		btn.innerHTML = `<span class="model-option-name">${escapeHtml(model.name)}</span>${model.description ? `<span class="model-option-desc">${escapeHtml(model.description)}</span>` : ""}`;
		btn.addEventListener("click", () => selectModel(model.id));

		const fav = document.createElement("button");
		fav.type = "button";
		fav.className = "model-fav-btn";
		fav.innerHTML = "★";
		updateFavButton(fav, model.id);
		fav.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleFavourite(model.id, fav);
		});

		row.appendChild(btn);
		row.appendChild(fav);
		list.appendChild(row);
	}
}

export function renderModelMenu() {
	loadFavourites();
	setupModelSearch();
	renderModelMenuList("model-menu-list");
	renderModelMenuList("chat-model-menu-list");
	syncModelLabels();
}

export function setModels(payload) {
	if (payload?.current) {
		if (!app.models.pendingModelSelection || payload.current === app.models.pendingModelSelection) {
			app.models.currentModelId = payload.current;
			if (payload.current === app.models.pendingModelSelection) app.models.pendingModelSelection = null;
		}
	}
	if (Array.isArray(payload?.models)) {
		app.models.list = payload.models;
	}
	renderModelMenu();
	if (Array.isArray(payload?.models)) renderSessions();
}

export function openModelDropdown(scope = "dashboard") {
	const config = MODEL_SCOPES[scope];
	if (!config) return;

	if (app.models.list.length === 0) requestAgentDefaults();

	const menu = $(config.menuId);
	const dropdown = $(config.dropdownId);
	if (!menu || !dropdown) return;

	const wasOpen = !menu.classList.contains("hidden");
	closeAllDropdowns();
	if (wasOpen) return;

	app.models.activeScope = scope;
	menu.classList.remove("hidden");
	dropdown.classList.add("is-open");
	app.models.searchQuery = "";
	const modelSearch = $(config.searchId);
	if (modelSearch) modelSearch.value = "";
	renderModelMenuList(config.listId);
	requestAnimationFrame(() => modelSearch?.focus());
}

export function toggleFavouritesOnly() {
	app.models.favouritesOnly = !app.models.favouritesOnly;
	saveFavsOnly();
	updateFavToggleHeaders();
	renderModelMenuList("model-menu-list");
	renderModelMenuList("chat-model-menu-list");
	return app.models.favouritesOnly;
}

function setupModelSearchForScope(scope) {
	const config = MODEL_SCOPES[scope];
	const modelSearch = $(config.searchId);
	if (!modelSearch || modelSearch.dataset.ready) return;
	modelSearch.dataset.ready = "1";

	modelSearch.addEventListener("input", () => {
		clearTimeout(app.models.searchTimer);
		app.models.searchTimer = setTimeout(() => {
			app.models.activeScope = scope;
			app.models.searchQuery = modelSearch.value;
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