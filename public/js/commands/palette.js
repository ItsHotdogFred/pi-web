import { app } from "../state/store.js";
import { COMPOSER_SCOPES } from "../config.js";
import { $ } from "../dom/elements.js";
import { escapeHtml } from "../utils/format.js";
import { requestAgentDefaults } from "../notifications/prompt.js";
import { getActiveInput } from "../chat/messages.js";
import { closeFileReferences } from "../composer/references.js";
import { createInlinePicker } from "../composer/inlineList.js";

function filteredCommands(filter) {
	const q = filter.trim().toLowerCase().replace(/^\//, "");
	if (!q) return app.project.commands;
	return app.project.commands.filter(
		(command) =>
			command.name.toLowerCase().includes(q) ||
			command.description.toLowerCase().includes(q),
	);
}

function applyCommand(command, targetInput = getActiveInput()) {
	const suffix = command.hint ? " " : "";
	targetInput.value = `/${command.name}${suffix}`;
	targetInput.dispatchEvent(new Event("input"));
	targetInput.focus();
}

function renderCommandsInto(listEl, items, onSelect) {
	listEl.replaceChildren();

	if (items.length === 0) {
		const empty = document.createElement("li");
		empty.innerHTML = `<button type="button" disabled><span class="command-desc">${escapeHtml(app.project.commands.length ? "No matching commands" : "Waiting for Pi commands…")}</span></button>`;
		listEl.appendChild(empty);
		return;
	}

	for (const command of items) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.innerHTML = `<span class="command-name">/${escapeHtml(command.name)}</span><span class="command-desc">${escapeHtml(command.description || command.hint || "")}</span>`;
		btn.addEventListener("click", () => onSelect(command));
		li.appendChild(btn);
		listEl.appendChild(li);
	}
}

function createCommandsPicker(containerEl, listEl) {
	return createInlinePicker({
		containerEl,
		listEl,
		shouldShow(input) {
			const show = input.value.startsWith("/");
			if (show) {
				const fileRefsOpen = Object.values(COMPOSER_SCOPES).some((scope) =>
					$(scope.inlineFileRefsId)?.classList.contains("is-open"),
				);
				if (fileRefsOpen) closeFileReferences();
			}
			return show;
		},
		getFilter(input) {
			return input.value.slice(1).split(/\s/)[0] ?? "";
		},
		fetchItems(filter) {
			return filteredCommands(filter);
		},
		renderItems: renderCommandsInto,
		onSelect(command, input) {
			applyCommand(command, input);
		},
		onOpen() {
			if (app.project.commands.length === 0) requestAgentDefaults();
		},
	});
}

const pickersByScope = new Map();

function getCommandsPicker(scope) {
	if (!pickersByScope.has(scope)) {
		const containerEl = $(scope.inlineCommandsId);
		const listEl = $(scope.inlineCommandsListId);
		if (!containerEl || !listEl) return null;
		pickersByScope.set(scope, createCommandsPicker(containerEl, listEl));
	}
	return pickersByScope.get(scope);
}

export function updateSlashCommandsFor(scope) {
	const inputEl = $(scope.inputId);
	const picker = getCommandsPicker(scope);
	if (!inputEl || !picker) return;
	picker.update(inputEl);
}

export function updateInlineCommands() {
	updateSlashCommandsFor(COMPOSER_SCOPES.dashboard);
}

export function updateChatSlashCommands() {
	updateSlashCommandsFor(COMPOSER_SCOPES.chat);
}

export function openCommands(targetInput = getActiveInput()) {
	targetInput.focus();
	if (!targetInput.value.startsWith("/")) {
		targetInput.value = "/";
	}
	targetInput.dispatchEvent(new Event("input"));
	targetInput.setSelectionRange(targetInput.value.length, targetInput.value.length);
}

export function closeCommands() {
	for (const scope of Object.values(COMPOSER_SCOPES)) {
		getCommandsPicker(scope)?.close();
	}
	closeFileReferences();
	const target = getActiveInput();
	if (target.value.startsWith("/") && !target.value.slice(1).includes(" ")) {
		target.value = "";
		target.dispatchEvent(new Event("input"));
	}
}

export function setCommands(nextCommands) {
	app.project.commands = Array.isArray(nextCommands) ? nextCommands : [];
	for (const scope of Object.values(COMPOSER_SCOPES)) {
		const containerEl = $(scope.inlineCommandsId);
		if (!containerEl?.classList.contains("is-open")) continue;
		getCommandsPicker(scope)?.invalidate();
		updateSlashCommandsFor(scope);
	}
}
