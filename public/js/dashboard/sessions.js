import { app } from "../state/store.js";
import { chatTitleEl } from "../dom/elements.js";
import { sessionTitle } from "./sessionHelpers.js";
import { renderTodayList, renderActivityFeed } from "./activity.js";
import {
	showView,
	startSessionSwitchAnimation,
	cancelSessionSwitchAnimation,
} from "../ui/views.js";
import { setBusy } from "../ui/status.js";

export function renderSessions() {
	renderTodayList();
	renderActivityFeed();
	const active = app.sessions.find((s) => s.sessionId === app.sessionId);
	if (active) chatTitleEl.textContent = sessionTitle(active);
	else if (app.sessionId) chatTitleEl.textContent = "New Agent";
}

export function upsertSession(entry) {
	const idx = app.sessions.findIndex((s) => s.sessionId === entry.sessionId);
	if (idx >= 0) {
		const merged = { ...app.sessions[idx], ...entry };
		if (entry.title == null && app.sessions[idx].title) merged.title = app.sessions[idx].title;
		app.sessions[idx] = merged;
	} else {
		app.sessions.push(entry);
	}
	renderSessions();
}

export function openSession(id) {
	if (id === app.sessionId && app.currentView === "chat") return;
	if (app.busy && id !== app.sessionId) return;
	app.awaitingNewAgentSession = false;
	app.freshDashboardSession = false;
	app.pendingDashboardPrompt = null;

	const switchingSession = app.currentView === "chat" && id !== app.sessionId;
	const requestId = switchingSession ? ++app.sessionSwitchRequestId : null;
	if (switchingSession) {
		app.activeSessionSwitchRequestId = requestId;
		startSessionSwitchAnimation();
	}
	app.sessionId = id;
	renderSessions();
	switchSession(id, requestId);
	showView("chat");
}

export function switchSession(id, requestId = null) {
	if (!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
	app.ws.send(JSON.stringify({ type: "switch_session", sessionId: id, requestId }));
}

export function newSession() {
	if (!app.ws || app.ws.readyState !== WebSocket.OPEN || app.creatingSession) return;
	cancelSessionSwitchAnimation();
	app.creatingSession = true;
	setBusy(app.busy);
	app.ws.send(JSON.stringify({ type: "new_session" }));
}
