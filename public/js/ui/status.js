import { app } from "../state/store.js";
import {
	statusEl,
	chatStatusEl,
	inputEl,
	sendEl,
	cancelEl,
	chatInputEl,
} from "../dom/elements.js";
import { renderContextUsage } from "../context/dial.js";

export function setStatus(state, detail = "") {
	for (const el of [statusEl, chatStatusEl]) {
		el.className = `connection-status status-${state}`;
		const labelEl = el.querySelector(".status-label");
		const labels = {
			connecting: "Connecting…",
			loading_history: "Loading…",
			ready: "Connected",
			busy: "Working…",
			error: detail || "Error",
		};
		labelEl.textContent = labels[state] ?? state;
	}
	if (state === "error" && detail) app.lastError = detail;
}

export function setBusy(nextBusy) {
	if (nextBusy) app.wasBusyForNotification = true;
	app.busy = nextBusy;
	const connected = app.ws && app.ws.readyState === WebSocket.OPEN;
	const canSendDashboard = Boolean(inputEl.value.trim() || app.dashboardAttachments.length);
	sendEl.disabled = !connected || app.busy || app.creatingSession || !canSendDashboard;
	cancelEl.disabled = !app.busy;
	inputEl.disabled = !connected;
	chatInputEl.disabled = !connected;
	sendEl.classList.toggle("hidden", !canSendDashboard);
	cancelEl?.classList.toggle("hidden", !app.busy);
	renderContextUsage();
}
