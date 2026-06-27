import { app } from "../state/store.js";
import {
	dashboardViewEl,
	chatViewEl,
	chatAreaEl,
	sidebarEl,
	activityFeedEl,
} from "../dom/elements.js";
import { prefersReducedMotion } from "../utils/animation.js";
import { scrollToBottomAfterLayout } from "../chat/messages.js";
import { syncSessionLoadUi } from "./status.js";
import { renderContextUsage } from "../context/dial.js";
import { renderActivityFeed } from "../dashboard/activity.js";
import { loadContributions } from "../dashboard/contributions.js";
import { refreshTabBaseTitle } from "./tabStatus.js";

const VIEW_ANIM_MS = 280;
const SWITCH_WATCHDOG_MS = 12_000;

function clearSwitchWatchdog() {
	if (app.session.switchWatchdogTimer) {
		clearTimeout(app.session.switchWatchdogTimer);
		app.session.switchWatchdogTimer = null;
	}
}

function scheduleSwitchWatchdog() {
	clearSwitchWatchdog();
	app.session.switchWatchdogTimer = setTimeout(() => {
		app.session.switchWatchdogTimer = null;
		finishSessionSwitchAnimation(null, { force: true });
		clearActiveSessionSwitchRequest();
		syncSessionLoadUi();
	}, SWITCH_WATCHDOG_MS);
}

function needsSessionSwitchReveal() {
	return (
		app.session.sessionSwitchAnimating ||
		Boolean(chatAreaEl?.classList.contains("session-switch-hidden"))
	);
}

function matchesSwitchRequest(requestId) {
	if (requestId == null) return app.session.activeSessionSwitchRequestId == null;
	return requestId === app.session.activeSessionSwitchRequestId;
}

function completeSessionSwitchReveal(token) {
	if (token !== app.session.sessionSwitchAnimationToken) return;
	clearSwitchWatchdog();
	chatAreaEl?.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
	app.session.sessionSwitchAnimating = false;
}

export function clearActiveSessionSwitchRequest(requestId = null) {
	if (
		requestId != null &&
		app.session.activeSessionSwitchRequestId != null &&
		requestId !== app.session.activeSessionSwitchRequestId
	) {
		return;
	}
	clearSwitchWatchdog();
	app.session.activeSessionSwitchRequestId = null;
	app.session.sessionSwitchAnimating = false;
}

function revealSessionSwitch() {
	const token = ++app.session.sessionSwitchAnimationToken;

	if (prefersReducedMotion() || !chatAreaEl) {
		completeSessionSwitchReveal(token);
		return;
	}

	scrollToBottomAfterLayout(() => {
		if (token !== app.session.sessionSwitchAnimationToken) return;
		chatAreaEl.classList.remove("view-leaving", "session-switch-hidden");
		chatAreaEl.classList.add("view-entering");

		let done = false;
		const finalize = () => {
			if (done || token !== app.session.sessionSwitchAnimationToken) return;
			done = true;
			completeSessionSwitchReveal(token);
		};

		chatAreaEl.addEventListener("animationend", finalize, { once: true });
		setTimeout(finalize, VIEW_ANIM_MS + 40);
	});
}

export function startSessionSwitchAnimation() {
	if (app.session.sessionSwitchAnimating) {
		app.session.sessionSwitchAnimationToken++;
		if (chatAreaEl) {
			chatAreaEl.classList.remove("view-entering");
			if (!chatAreaEl.classList.contains("view-leaving")) {
				chatAreaEl.classList.add("session-switch-hidden");
			}
		}
		scheduleSwitchWatchdog();
		return;
	}

	app.session.sessionSwitchAnimating = true;
	scheduleSwitchWatchdog();
	const token = ++app.session.sessionSwitchAnimationToken;

	if (prefersReducedMotion() || !chatAreaEl) return;

	chatAreaEl.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
	chatAreaEl.classList.add("view-leaving");

	let hidden = false;
	const hideAfterLeave = () => {
		if (hidden || token !== app.session.sessionSwitchAnimationToken) return;
		hidden = true;
		chatAreaEl.classList.remove("view-leaving");
		if (!chatAreaEl.classList.contains("view-entering")) {
			chatAreaEl.classList.add("session-switch-hidden");
		}
	};

	chatAreaEl.addEventListener("animationend", hideAfterLeave, { once: true });
	setTimeout(hideAfterLeave, VIEW_ANIM_MS + 40);
}

export function finishSessionSwitchAnimation(requestId = null, { force = false } = {}) {
	if (
		requestId != null &&
		app.session.activeSessionSwitchRequestId != null &&
		requestId !== app.session.activeSessionSwitchRequestId
	) {
		return;
	}
	if (!force && !matchesSwitchRequest(requestId)) return;
	if (!needsSessionSwitchReveal()) return;
	revealSessionSwitch();
}

export function cancelSessionSwitchAnimation() {
	clearSwitchWatchdog();
	app.session.sessionSwitchAnimationToken++;
	app.session.sessionSwitchAnimating = false;
	app.session.activeSessionSwitchRequestId = null;
	chatAreaEl?.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
}

export function isStaleSwitchMessage(msg) {
	if (msg.requestId == null || app.session.activeSessionSwitchRequestId == null) return false;
	return msg.requestId !== app.session.activeSessionSwitchRequestId;
}

export function showView(view, { animate = true } = {}) {
	if (view !== "chat") cancelSessionSwitchAnimation();
	const prevView = app.ui.currentView;
	if (view === prevView && !app.ui.viewTransitioning) {
		document.querySelectorAll(".nav-item").forEach((el) => {
			el.classList.toggle("active", el.dataset.view === view);
		});
		sidebarEl.classList.remove("open");
		renderContextUsage();
		return;
	}

	app.ui.currentView = view;
	refreshTabBaseTitle();
	if (view === "dashboard") app.ui.animateActivityFeed = animate && activityFeedEl.childElementCount === 0;

	document.querySelectorAll(".nav-item").forEach((el) => {
		el.classList.toggle("active", el.dataset.view === view);
	});
	sidebarEl.classList.remove("open");

	const fromEl = prevView === "dashboard" ? dashboardViewEl : chatViewEl;
	const toEl = view === "dashboard" ? dashboardViewEl : chatViewEl;

	if (!animate || prefersReducedMotion()) {
		dashboardViewEl.classList.toggle("hidden", view !== "dashboard");
		chatViewEl.classList.toggle("hidden", view !== "chat");
		if (view === "dashboard") renderActivityFeed();
		if (view === "dashboard") void loadContributions();
		renderContextUsage();
		return;
	}

	app.ui.viewTransitioning = true;
	fromEl.classList.add("view-leaving");

	fromEl.addEventListener(
		"animationend",
		() => {
			fromEl.classList.remove("view-leaving");
			fromEl.classList.add("hidden");

			toEl.classList.remove("hidden");
			toEl.classList.add("view-entering");

			toEl.addEventListener(
				"animationend",
				() => {
					toEl.classList.remove("view-entering");
					app.ui.viewTransitioning = false;
					if (view === "dashboard") renderActivityFeed();
					if (view === "dashboard") void loadContributions();
					renderContextUsage();
				},
				{ once: true },
			);
		},
		{ once: true },
	);

	renderContextUsage();
}

export function setNavActive(view) {
	document.querySelectorAll(".nav-item").forEach((el) => {
		el.classList.toggle("active", el.dataset.view === view);
	});
}
