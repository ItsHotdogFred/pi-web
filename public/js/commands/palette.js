import { app } from "../state/store.js";
import {
	inlineCommandsEl,
	inlineCommandsListEl,
	chatInlineCommandsEl,
	chatInlineCommandsListEl,
	inputEl,
	chatInputEl,
} from "../dom/elements.js";
import { animateEnter } from "../utils/animation.js";
import { escapeHtml } from "../utils/format.js";
import { requestAgentDefaults } from "../notifications/prompt.js";
import { getActiveInput } from "../chat/messages.js";

function filteredCommands(filter) {
	const q = filter.trim().toLowerCase().replace(/^\//, "");
	if (!q) return app.commands;
	return app.commands.filter(
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

function renderCommandsInto(listEl, filter, onSelect) {
	const matches = filteredCommands(filter);
	listEl.replaceChildren();

	if (matches.length === 0) {
		const empty = document.createElement("li");
		empty.innerHTML = `<button type="button" disabled><span class="command-desc">${escapeHtml(app.commands.length ? "No matching commands" : "Waiting for Pi commands…")}</span></button>`;
		listEl.appendChild(empty);
		return;
	}

	for (const command of matches) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.innerHTML = `<span class="command-name">/${escapeHtml(command.name)}</span><span class="command-desc">${escapeHtml(command.description || command.hint || "")}</span>`;
		btn.addEventListener("click", () => onSelect(command));
		li.appendChild(btn);
		listEl.appendChild(li);
	}
}

function updateSlashCommands(targetInput, containerEl, listEl) {
	const show = targetInput.value.startsWith("/");
	const wasHidden = !containerEl.classList.contains("is-open");
	containerEl.classList.toggle("is-open", show);
	containerEl.setAttribute("aria-hidden", String(!show));
	if (!show) {
		listEl.classList.remove("anim-fade-down");
		return;
	}

	if (show && app.commands.length === 0) requestAgentDefaults();

	if (wasHidden) animateEnter(listEl, "anim-fade-down");

	const query = targetInput.value.slice(1).split(/\s/)[0] ?? "";
	renderCommandsInto(listEl, query, (command) => applyCommand(command, targetInput));
}

export function updateInlineCommands() {
	updateSlashCommands(inputEl, inlineCommandsEl, inlineCommandsListEl);
}

export function updateChatSlashCommands() {
	updateSlashCommands(chatInputEl, chatInlineCommandsEl, chatInlineCommandsListEl);
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
	inlineCommandsEl.classList.remove("is-open");
	inlineCommandsEl.setAttribute("aria-hidden", "true");
	chatInlineCommandsEl.classList.remove("is-open");
	chatInlineCommandsEl.setAttribute("aria-hidden", "true");
	const target = getActiveInput();
	if (target.value.startsWith("/") && !target.value.slice(1).includes(" ")) {
		target.value = "";
		target.dispatchEvent(new Event("input"));
	}
}

export function setCommands(nextCommands) {
	app.commands = Array.isArray(nextCommands) ? nextCommands : [];
	if (inlineCommandsEl.classList.contains("is-open")) updateInlineCommands();
	if (chatInlineCommandsEl.classList.contains("is-open")) updateChatSlashCommands();
}
