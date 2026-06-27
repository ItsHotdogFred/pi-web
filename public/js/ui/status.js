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
import { dismissSplash, setSplashStatus } from "./splash.js";

export function setStatus(state, detail = "") {
	const splashLabels = {
		connecting: "Connecting to Pi…",
		loading_history: "Loading session…",
		error: detail || "Connection failed",
	};
	if (state === "ready" || state === "error") {
		dismissSplash();
	} else if (splashLabels[state]) {
		setSplashStatus(splashLabels[state]);
	}

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
	if (state === "error" && detail) app.connection.lastError = detail;
}

export function setBusy(nextBusy) {
	if (nextBusy) app.connection.wasBusyForNotification = true;
	app.ui.busy = nextBusy;
	const connected = app.connection.ws && app.connection.ws.readyState === WebSocket.OPEN;
	const canSendDashboard = Boolean(inputEl?.value.trim() || app.composer.dashboardAttachments.length);
	sendEl && (sendEl.disabled = !connected || app.ui.busy || app.session.creatingSession || !canSendDashboard);
	cancelEl && (cancelEl.disabled = !app.ui.busy);
	if (inputEl) inputEl.disabled = !connected;
	if (chatInputEl) chatInputEl.disabled = !connected;
	sendEl?.classList.toggle("hidden", !canSendDashboard);
	cancelEl?.classList.toggle("hidden", !app.ui.busy);
	renderContextUsage();
}
