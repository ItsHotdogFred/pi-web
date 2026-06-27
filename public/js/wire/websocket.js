import { app } from "../state/store.js";
import { wsUrl } from "../config.js";
import { clearPendingUserMessage } from "../chat/history.js";
import { setStatus, setBusy } from "../ui/status.js";
import { isStaleSwitchMessage } from "../ui/views.js";
import { clearPermissionRequests } from "../permissions/modal.js";
import { dispatchMessage } from "./handlers.js";
import {
	setResumeSessionId,
	clearResumeSessionId,
	getReconnectAttempt,
	incrementReconnectAttempt,
	resetReconnectAttempts,
} from "./connection.js";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 20;

let reconnectTimer = null;
let connectionGeneration = 0;

function clearReconnectTimer() {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function getReconnectDelayMs() {
	const delay = RECONNECT_BASE_MS * 2 ** (getReconnectAttempt() - 1);
	return Math.min(delay, RECONNECT_MAX_MS);
}

function scheduleReconnect() {
	clearReconnectTimer();
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect(true);
	}, getReconnectDelayMs());
}

function resetConnectionState(isReconnect) {
	app.connection.lastError = "";
	app.connection.gotReady = false;
	app.session.creatingSession = false;
	app.session.awaitingNewAgentSession = false;
	app.session.freshDashboardSession = false;
	app.session.pendingDashboardPrompt = null;
	app.session.loadingHistory = false;
	clearPendingUserMessage();
	app.connection.defaultsRequested = false;
	app.connection.wasBusyForNotification = false;

	if (isReconnect) {
		if (app.session.sessionId) setResumeSessionId(app.session.sessionId);
	} else {
		app.session.sessionId = null;
		clearResumeSessionId();
	}
}

export function reconnect() {
	resetReconnectAttempts();
	clearReconnectTimer();
	connect(false);
}

export function connect(isReconnect = false) {
	clearReconnectTimer();
	if (!isReconnect) resetReconnectAttempts();
	connectionGeneration += 1;
	const generation = connectionGeneration;

	if (app.connection.ws) {
		try {
			app.connection.ws.close();
		} catch {
			// ignore
		}
		app.connection.ws = null;
	}

	resetConnectionState(isReconnect);
	setStatus("connecting");
	app.connection.ws = new WebSocket(wsUrl);

	app.connection.ws.addEventListener("open", () => {
		if (generation !== connectionGeneration) return;
		setBusy(false);
	});

	app.connection.ws.addEventListener("close", () => {
		if (generation !== connectionGeneration) return;
		clearPermissionRequests();
		setBusy(false);
		incrementReconnectAttempt();
		if (getReconnectAttempt() > MAX_RECONNECT_ATTEMPTS) {
			clearReconnectTimer();
			setStatus("error", "Disconnected — refresh to retry");
			return;
		}
		setStatus("error", app.connection.gotReady ? "Disconnected" : app.connection.lastError || "Disconnected");
		scheduleReconnect();
	});

	app.connection.ws.addEventListener("error", () => {
		if (generation !== connectionGeneration) return;
		if (!app.connection.gotReady) app.connection.lastError = "Connection failed";
	});

	app.connection.ws.addEventListener("message", (event) => {
		if (generation !== connectionGeneration) return;

		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}

		if (isStaleSwitchMessage(msg)) return;

		dispatchMessage(msg);
	});
}
