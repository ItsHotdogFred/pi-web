import { app } from "../state/store.js";
import { $ } from "../dom/elements.js";
import { escapeHtml, normalizeStatus } from "../utils/format.js";
import { resolveToolName } from "../utils/tools.js";
import {
	extractTodoDetails,
	selectHasActive,
	selectOverlayLayout,
	selectTodoCounts,
	selectVisibleOverlayTasks,
	todoStatusIcon,
} from "./todoState.js";
import { icon } from "../icons/hover-icons.js";

const MAX_VISIBLE_LINES = 12;
const hiddenCompletedIds = new Set();
const completedPendingHide = new Set();

let panelEl = null;
let titleEl = null;
let countEl = null;
let listEl = null;
let moreEl = null;

function ensureElements() {
	if (!panelEl) panelEl = $("todo-panel");
	if (!titleEl) titleEl = $("todo-panel-title");
	if (!countEl) countEl = $("todo-panel-count");
	if (!listEl) listEl = $("todo-list");
	if (!moreEl) moreEl = $("todo-panel-more");
}

export function resetTodoPanel() {
	app.chat.todos.tasks = [];
	app.chat.todos.nextId = 0;
	app.chat.todos.readyToHideCompleted = false;
	hiddenCompletedIds.clear();
	completedPendingHide.clear();
	renderTodoPanel();
}

/** After history replay, show completed items until the next live agent turn. */
export function resetTodoDisplayState() {
	hiddenCompletedIds.clear();
	completedPendingHide.clear();
	app.chat.todos.readyToHideCompleted = false;
	renderTodoPanel();
}

export function hideCompletedTodosFromPreviousTurn() {
	if (completedPendingHide.size === 0) return;
	for (const id of completedPendingHide) hiddenCompletedIds.add(id);
	completedPendingHide.clear();
	renderTodoPanel();
}

export function onAgentResponseStart() {
	if (!app.chat.todos.readyToHideCompleted) return;
	app.chat.todos.readyToHideCompleted = false;
	hideCompletedTodosFromPreviousTurn();
}

export function markTodoTurnComplete() {
	app.chat.todos.readyToHideCompleted = true;
}

/**
 * @param {{ toolName?: string, title?: string, status?: string, rawOutput?: unknown }} msg
 */
export function syncTodoFromTool(msg) {
	const toolName = resolveToolName(msg).toLowerCase();
	if (toolName !== "todo") return;
	if (msg.rawOutput == null) return;

	const status = normalizeStatus(msg.status);
	if (status === "failed" || status === "error") return;

	const details = extractTodoDetails(msg.rawOutput);
	if (!details) return;

	app.chat.todos.tasks = details.tasks;
	app.chat.todos.nextId = details.nextId;
	renderTodoPanel();
}

function formatTaskLabel(task, showIds) {
	const blocked =
		task.blockedBy?.length ? ` <span class="todo-blocked">⛓ #${task.blockedBy.join(", #")}</span>` : "";
	const prefix = showIds ? `<span class="todo-id">#${task.id}</span> ` : "";
	const active =
		task.status === "in_progress" && task.activeForm
			? ` <span class="todo-active-form">(${escapeHtml(task.activeForm)})</span>`
			: "";
	return `${prefix}<span class="todo-subject">${escapeHtml(task.subject)}</span>${active}${blocked}`;
}

function renderTodoPanel() {
	ensureElements();
	if (!panelEl || !listEl) return;

	const overlayTasks = selectVisibleOverlayTasks(app.chat.todos.tasks, hiddenCompletedIds);
	if (!overlayTasks.length) {
		panelEl.classList.add("hidden");
		listEl.replaceChildren();
		if (moreEl) {
			moreEl.textContent = "";
			moreEl.classList.add("hidden");
		}
		return;
	}

	panelEl.classList.remove("hidden");

	const counts = selectTodoCounts(overlayTasks);
	const hasActive = selectHasActive(overlayTasks);
	const showIds = overlayTasks.some((task) => task.blockedBy?.length);

	if (titleEl) {
		titleEl.textContent = "Todos";
		titleEl.classList.toggle("todo-panel-title--active", hasActive);
	}
	const iconEl = $("todo-panel-icon");
	if (iconEl) {
		iconEl.innerHTML = hasActive
			? icon("refresh", { size: 14, className: "todo-panel-icon", spin: true })
			: icon("unordered-list", { size: 14, className: "todo-panel-icon" });
	}
	if (countEl) countEl.textContent = `(${counts.completed}/${counts.total})`;
	panelEl.classList.toggle("todo-panel--active", hasActive);

	const layout = selectOverlayLayout(overlayTasks, MAX_VISIBLE_LINES);
	listEl.replaceChildren();

	for (const task of layout.visible) {
		const li = document.createElement("li");
		li.className = `todo-item todo-item--${task.status}`;
		li.innerHTML = `
			<span class="todo-status" aria-hidden="true">${todoStatusIcon(task.status)}</span>
			<span class="todo-text">${formatTaskLabel(task, showIds)}</span>`;
		listEl.appendChild(li);

		if (task.status === "completed" && !completedPendingHide.has(task.id) && !hiddenCompletedIds.has(task.id)) {
			completedPendingHide.add(task.id);
		}
	}

	if (moreEl) {
		const totalHidden = layout.hiddenCompleted + layout.truncatedTail;
		if (totalHidden > 0) {
			const parts = [];
			if (layout.hiddenCompleted > 0) parts.push(`${layout.hiddenCompleted} completed`);
			if (layout.truncatedTail > 0) parts.push(`${layout.truncatedTail} pending`);
			moreEl.textContent = `+${totalHidden} more (${parts.join(", ")})`;
			moreEl.classList.remove("hidden");
		} else {
			moreEl.textContent = "";
			moreEl.classList.add("hidden");
		}
	}
}
