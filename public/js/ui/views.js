import { app } from "../state/store.js";
import {
	dashboardViewEl,
	chatViewEl,
	chatAreaEl,
	sidebarEl,
	activityFeedEl,
} from "../dom/elements.js";
import { prefersReducedMotion } from "../utils/animation.js";
import { renderContextUsage } from "../context/dial.js";
import { renderActivityFeed } from "../dashboard/activity.js";
import { loadContributions } from "../dashboard/contributions.js";

export function startSessionSwitchAnimation() {
	if (app.sessionSwitchAnimating) {
		if (!prefersReducedMotion() && chatAreaEl) {
			chatAreaEl.classList.remove("view-entering");
			if (!chatAreaEl.classList.contains("view-leaving")) {
				chatAreaEl.classList.add("session-switch-hidden");
			}
		}
		return;
	}

	app.sessionSwitchAnimating = true;
	const token = ++app.sessionSwitchAnimationToken;
	if (prefersReducedMotion() || !chatAreaEl) return;
	chatAreaEl.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
	chatAreaEl.classList.add("view-leaving");
	chatAreaEl.addEventListener(
		"animationend",
		() => {
			if (token !== app.sessionSwitchAnimationToken) return;
			chatAreaEl.classList.remove("view-leaving");
			chatAreaEl.classList.add("session-switch-hidden");
		},
		{ once: true },
	);
}

export function finishSessionSwitchAnimation(requestId = null) {
	if (requestId == null && app.activeSessionSwitchRequestId != null) return;
	if (requestId != null && requestId !== app.activeSessionSwitchRequestId) return;
	if (!app.sessionSwitchAnimating) return;
	const token = ++app.sessionSwitchAnimationToken;
	if (prefersReducedMotion() || !chatAreaEl) {
		app.sessionSwitchAnimating = false;
		return;
	}
	chatAreaEl.classList.remove("view-leaving", "session-switch-hidden");
	chatAreaEl.classList.add("view-entering");
	chatAreaEl.addEventListener(
		"animationend",
		() => {
			if (token !== app.sessionSwitchAnimationToken) return;
			chatAreaEl.classList.remove("view-entering");
			app.sessionSwitchAnimating = false;
		},
		{ once: true },
	);
}

export function cancelSessionSwitchAnimation() {
	app.sessionSwitchAnimationToken++;
	app.sessionSwitchAnimating = false;
	app.activeSessionSwitchRequestId = null;
	chatAreaEl?.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
}

export function isStaleSwitchMessage(msg) {
	return msg.requestId != null && msg.requestId !== app.activeSessionSwitchRequestId;
}

export function showView(view, { animate = true } = {}) {
	if (view !== "chat") cancelSessionSwitchAnimation();
	const prevView = app.currentView;
	if (view === prevView && !app.viewTransitioning) {
		document.querySelectorAll(".nav-item").forEach((el) => {
			el.classList.toggle("active", el.dataset.view === view);
		});
		sidebarEl.classList.remove("open");
		renderContextUsage();
		return;
	}

	app.currentView = view;
	if (view === "dashboard") app.animateActivityFeed = animate && activityFeedEl.childElementCount === 0;

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

	app.viewTransitioning = true;
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
					app.viewTransitioning = false;
					if (view === "dashboard") renderActivityFeed();
					if (view === "dashboard") void loadContributions();
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
