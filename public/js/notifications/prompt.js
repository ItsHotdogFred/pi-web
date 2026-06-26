import { app } from "../state/store.js";
import { NOTIFICATIONS_PREF_KEY } from "../config.js";
import {
	$,
	notificationPromptModalEl,
	notificationPromptEnableEl,
	notificationPromptDismissEl,
} from "../dom/elements.js";
import { sessionTitle } from "../dashboard/sessionHelpers.js";

function getNotificationPref() {
	try {
		return localStorage.getItem(NOTIFICATIONS_PREF_KEY);
	} catch {
		return null;
	}
}

function setNotificationPref(value) {
	try {
		localStorage.setItem(NOTIFICATIONS_PREF_KEY, value);
	} catch {
		// ignore storage failures
	}
}

function setNotificationPromptOpen(open) {
	if (!notificationPromptModalEl) return;
	notificationPromptModalEl.classList.toggle("hidden", !open);
	notificationPromptModalEl.setAttribute("aria-hidden", String(!open));
}

export function maybePromptForNotifications() {
	if (!("Notification" in window)) return;
	if (getNotificationPref() !== null) return;
	setNotificationPromptOpen(true);
	notificationPromptEnableEl?.focus();
}

async function enableTaskNotifications() {
	setNotificationPromptOpen(false);
	if (!("Notification" in window)) {
		setNotificationPref("disabled");
		return;
	}
	const result =
		Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
	setNotificationPref(result === "granted" ? "enabled" : "disabled");
}

function dismissTaskNotifications() {
	setNotificationPref("disabled");
	setNotificationPromptOpen(false);
}

export function requestAgentDefaults() {
	if (app.defaultsRequested || !app.ws || app.ws.readyState !== WebSocket.OPEN) return;
	app.defaultsRequested = true;
	app.ws.send(JSON.stringify({ type: "fetch_defaults" }));
}

export function scheduleAgentDefaultsFetch() {
	if (app.defaultsRequested || app.models.length > 0) return;
	const run = () => requestAgentDefaults();
	if ("requestIdleCallback" in window) {
		requestIdleCallback(run, { timeout: 5000 });
	} else {
		setTimeout(run, 2500);
	}
}

export function notifyTaskComplete() {
	if (getNotificationPref() !== "enabled") return;
	if (!("Notification" in window) || Notification.permission !== "granted") return;
	if (!app.wasBusyForNotification) return;
	if (!document.hidden && app.currentView === "chat") return;

	const active = app.sessions.find((s) => s.sessionId === app.sessionId);
	const title = active ? sessionTitle(active) : "Pi";
	try {
		new Notification("Pi finished", {
			body: `${title} completed its task`,
			icon: "/favicon.svg",
		});
	} catch {
		// ignore notification failures
	}
}

export function initNotificationPrompt() {
	if (!notificationPromptModalEl) return;

	notificationPromptEnableEl?.addEventListener("click", () => {
		void enableTaskNotifications();
	});
	notificationPromptDismissEl?.addEventListener("click", dismissTaskNotifications);
	$("notification-prompt-backdrop")?.addEventListener("click", dismissTaskNotifications);
}
