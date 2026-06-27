import { app } from "../state/store.js";
import { NOTIFICATIONS_PREF_KEY } from "../config.js";
import {
	$,
	notificationPromptModalEl,
	notificationPromptEnableEl,
	notificationPromptDismissEl,
} from "../dom/elements.js";
import { sessionTitle } from "../dashboard/sessionHelpers.js";
import { createModal } from "../ui/modal.js";

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

let notificationPromptModal = null;

function getNotificationPromptModal() {
	if (!notificationPromptModal && notificationPromptModalEl) {
		notificationPromptModal = createModal({
			el: notificationPromptModalEl,
			backdropEl: $("notification-prompt-backdrop"),
			onClose: dismissTaskNotifications,
			restoreFocus: false,
		});
	}
	return notificationPromptModal;
}

export function maybePromptForNotifications() {
	if (!("Notification" in window)) return;
	if (getNotificationPref() !== null) return;
	getNotificationPromptModal()?.open();
	notificationPromptEnableEl?.focus();
}

async function enableTaskNotifications() {
	getNotificationPromptModal()?.close();
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
	getNotificationPromptModal()?.close();
}

export function requestAgentDefaults() {
	if (app.connection.defaultsRequested || !app.connection.ws || app.connection.ws.readyState !== WebSocket.OPEN) return;
	app.connection.defaultsRequested = true;
	app.connection.ws.send(JSON.stringify({ type: "fetch_defaults" }));
}

export function scheduleAgentDefaultsFetch({ immediate = false } = {}) {
	if (app.connection.defaultsRequested || app.models.list.length > 0) return;
	if (immediate) {
		requestAgentDefaults();
		return;
	}
	const run = () => requestAgentDefaults();
	if ("requestIdleCallback" in window) {
		requestIdleCallback(run, { timeout: 500 });
	} else {
		setTimeout(run, 100);
	}
}

export function notifyTaskComplete() {
	if (getNotificationPref() !== "enabled") return;
	if (!("Notification" in window) || Notification.permission !== "granted") return;
	if (!app.connection.wasBusyForNotification) return;
	if (!document.hidden && app.ui.currentView === "chat") return;

	const active = app.session.sessions.find((s) => s.sessionId === app.session.sessionId);
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
}
