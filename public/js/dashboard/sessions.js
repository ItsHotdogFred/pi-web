import { app } from "../state/store.js";
import { chatTitleEl, sidebarSearchEl } from "../dom/elements.js";
import { sessionTitle } from "./sessionHelpers.js";
import { renderTodayList, renderActivityFeed } from "./activity.js";
import {
	showView,
	startSessionSwitchAnimation,
	cancelSessionSwitchAnimation,
} from "../ui/views.js";
import { setBusy } from "../ui/status.js";
import { refreshTabBaseTitle } from "../ui/tabStatus.js";

export function renderSessions() {
	sidebarSearchEl?.classList.toggle("search-loading", app.ui.sessionSearchLoading);
	renderTodayList();
	renderActivityFeed();
	const active = app.session.sessions.find((s) => s.sessionId === app.session.sessionId);
	if (active) chatTitleEl.textContent = sessionTitle(active);
	else if (app.session.sessionId) chatTitleEl.textContent = "New Agent";
	refreshTabBaseTitle();
}

export function upsertSession(entry) {
	const idx = app.session.sessions.findIndex((s) => s.sessionId === entry.sessionId);
	if (idx >= 0) {
		const merged = { ...app.session.sessions[idx], ...entry };
		if (entry.title == null && app.session.sessions[idx].title) merged.title = app.session.sessions[idx].title;
		app.session.sessions[idx] = merged;
	} else {
		app.session.sessions.push(entry);
	}
	renderSessions();
}

export function openSession(id) {
	if (id === app.session.sessionId && app.ui.currentView === "chat") return;
	if (app.ui.busy && id !== app.session.sessionId) return;
	app.session.awaitingNewAgentSession = false;
	app.session.freshDashboardSession = false;
	app.session.pendingDashboardPrompt = null;

	const switchingSession = app.ui.currentView === "chat" && id !== app.session.sessionId;
	const requestId = switchingSession ? ++app.session.sessionSwitchRequestId : null;
	if (switchingSession) {
		app.session.activeSessionSwitchRequestId = requestId;
		startSessionSwitchAnimation();
	}
	app.session.sessionId = id;
	renderSessions();
	switchSession(id, requestId);
	showView("chat");
}

export function switchSession(id, requestId = null) {
	if (!app.connection.ws || app.connection.ws.readyState !== WebSocket.OPEN) return;
	app.connection.ws.send(JSON.stringify({ type: "switch_session", sessionId: id, requestId }));
}

export function newSession() {
	if (!app.connection.ws || app.connection.ws.readyState !== WebSocket.OPEN || app.session.creatingSession) return;
	cancelSessionSwitchAnimation();
	app.session.creatingSession = true;
	setBusy(app.ui.busy);
	app.connection.ws.send(JSON.stringify({ type: "new_session" }));
}
