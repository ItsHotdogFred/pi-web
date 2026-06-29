import { app } from "../state/store.js";
import { escapeHtml } from "../utils/format.js";
import { animateEnter } from "../utils/animation.js";
import { todoStatusIcon } from "./todoState.js";
import {
	appendChatNode,
	finalizeThoughtBlock,
	scrollToBottom,
} from "./messages.js";

export function resetPlanPanel() {
	app.chat.activePlanPanel = null;
}

function normalizePlanEntry(entry) {
	if (typeof entry === "string") {
		return { content: entry, priority: "medium", status: "pending" };
	}
	return {
		content: entry?.content ?? entry?.description ?? entry?.text ?? "Task",
		priority: entry?.priority ?? "medium",
		status: entry?.status ?? "pending",
	};
}

function planStatusIcon(status) {
	return todoStatusIcon(status === "in_progress" ? "in_progress" : status === "completed" ? "completed" : "pending");
}

export function renderPlanPanel(entries) {
	const normalized = (Array.isArray(entries) ? entries : []).map(normalizePlanEntry);
	if (!normalized.length) return null;

	let panel = app.chat.activePlanPanel;
	if (!panel?.isConnected) {
		finalizeThoughtBlock();
		panel = document.createElement("article");
		panel.className = "msg msg-plan plan-panel";
		panel.innerHTML = `<span class="msg-label">Plan</span><ol class="plan-list"></ol>`;
		appendChatNode(panel);
		if (!app.session.batchHistoryMode) animateEnter(panel, "anim-fade-up");
		app.chat.activePlanPanel = panel;
	}

	const list = panel.querySelector(".plan-list");
	list.replaceChildren();
	for (const entry of normalized) {
		const li = document.createElement("li");
		li.className = `plan-item plan-item--${entry.status} plan-item--priority-${entry.priority}`;
		const priorityHtml =
			entry.priority !== "medium"
				? `<span class="plan-priority plan-priority--${entry.priority}">${entry.priority}</span>`
				: "";
		li.innerHTML = `
			<span class="plan-status" aria-hidden="true">${planStatusIcon(entry.status)}</span>
			<span class="plan-text">${escapeHtml(entry.content)}</span>
			${priorityHtml}`;
		list.appendChild(li);
	}
	scrollToBottom();
	return panel;
}
