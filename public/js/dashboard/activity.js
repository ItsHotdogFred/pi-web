import { app } from "../state/store.js";
import { ACTIVITY_ART_KEY } from "../config.js";
import {
	todayListEl,
	activityFeedEl,
} from "../dom/elements.js";
import { hashCode, formatRelativeTime } from "../utils/format.js";
import { animateEnter } from "../utils/animation.js";
import { SessionArt } from "../session-art.js";
import {
	filteredSessions,
	sessionTitle,
	sessionProjectName,
	sessionStatus,
	sessionBadgeIcon,
} from "./sessionHelpers.js";
import { openSession } from "./sessions.js";

function loadActivityArtStyle() {
	const styles = SessionArt?.styles ?? ["aurora", "identicon", "flow"];
	try {
		const stored = localStorage.getItem(ACTIVITY_ART_KEY);
		if (stored && styles.includes(stored)) return stored;
	} catch {
		/* ignore */
	}
	return styles[0];
}

app.activityArtStyle = loadActivityArtStyle();

function sessionAccentColor(sessionId) {
	const seed = hashCode(sessionId || "default");
	return SessionArt?.accentColor(app.activityArtStyle, seed) ?? "var(--muted)";
}

function applySessionArt(left, sessionId) {
	const seed = hashCode(sessionId || "default");
	const art = document.createElement("div");
	art.className = "activity-card-art";

	const result = SessionArt.render(app.activityArtStyle, seed);
	if (result.type === "css") {
		art.style.background = result.background;
	} else if (result.type === "svg") {
		art.innerHTML = result.html;
	} else if (result.type === "canvas") {
		art.appendChild(result.element);
	}

	const scrim = document.createElement("div");
	scrim.className = "activity-card-scrim";
	left.append(art, scrim);
	left.classList.add(`activity-card-left--${app.activityArtStyle}`);
}

function showArtStyleToast(style) {
	let toast = document.getElementById("art-style-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "art-style-toast";
		toast.className = "art-style-toast";
		document.body.appendChild(toast);
	}

	const label = SessionArt?.labels?.[style] ?? style;
	toast.textContent = `Activity art: ${label} · Ctrl+Shift+G to cycle`;
	toast.classList.add("visible");
	clearTimeout(app.artStyleToastTimer);
	app.artStyleToastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
}

export async function cycleActivityArtStyle() {
	const styles = SessionArt?.styles ?? ["aurora", "identicon", "flow"];
	const idx = styles.indexOf(app.activityArtStyle);
	app.activityArtStyle = styles[(idx + 1) % styles.length];
	try {
		localStorage.setItem(ACTIVITY_ART_KEY, app.activityArtStyle);
	} catch {
		/* ignore */
	}
	const { renderSessions } = await import("./sessions.js");
	renderSessions();
	showArtStyleToast(app.activityArtStyle);
}

function sessionIconSvg(color) {
	return `<svg class="today-item-icon" style="color:${color}" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
		<path d="M3 3.5h8a1 1 0 011 1v5a1 1 0 01-1 1H6.5L4 13V9.5H3a1 1 0 01-1-1v-5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
	</svg>`;
}

function runningIconSvg() {
	return `<svg class="today-item-icon running" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
		<circle cx="7" cy="7" r="5.25" stroke="currentColor" stroke-width="1.1"/>
	</svg>`;
}

function renderTodayList() {
	const list = filteredSessions();
	todayListEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("p");
		empty.className = "today-empty";
		empty.textContent = app.searchQuery ? "No matches" : "No agents yet";
		todayListEl.appendChild(empty);
		return;
	}

	for (const session of list) {
		const isActive = session.sessionId === app.sessionId;
		const isRunning = isActive && app.busy;
		const status = sessionStatus(session, { isActive, isRunning });

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "today-item" + (isActive ? " active" : "");
		btn.dataset.sessionId = session.sessionId;

		const icon = isRunning ? runningIconSvg() : sessionIconSvg(sessionAccentColor(session.sessionId));
		const meta = isRunning
			? "Working…"
			: formatRelativeTime(session.updatedAt) || sessionProjectName(session);

		btn.innerHTML = `${icon}<span class="today-item-body"><span class="today-item-title">${sessionTitle(session)}</span><span class="today-item-meta">${meta}</span></span>`;

		btn.addEventListener("click", () => openSession(session.sessionId));
		todayListEl.appendChild(btn);
	}
}

function renderActivityCardLeft(session, status, isRunning) {
	const left = document.createElement("div");
	left.className = "activity-card-left";

	if (isRunning) {
		left.classList.add("code-preview");
		const preview = app.lastPrompt || sessionTitle(session);
		const lines = preview.split("\n").slice(0, 2);
		left.innerHTML = lines
			.map((line) => `<div class="code-line">${line.trim()}</div>`)
			.join("");
		return left;
	}

	applySessionArt(left, session.sessionId);

	const content = document.createElement("div");
	content.className = "activity-card-content";

	const meta = document.createElement("div");
	meta.className = "activity-card-meta";

	const time = document.createElement("span");
	time.className = "activity-card-time";
	time.textContent = formatRelativeTime(session.updatedAt) || "No activity yet";

	const project = document.createElement("span");
	project.className = "activity-card-project";
	project.textContent = sessionProjectName(session);

	meta.append(time, project);

	const badge = document.createElement("span");
	badge.className = `activity-badge ${status.variant}`;
	badge.innerHTML = `${sessionBadgeIcon(status.variant)} ${status.label}`;

	content.append(meta, badge);
	left.append(content);
	return left;
}

export function renderActivityFeed() {
	const list = filteredSessions();
	activityFeedEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("div");
		empty.className = "activity-empty";
		empty.textContent = app.searchQuery ? "No matching agents" : "No recent activity — ask Pi above";
		activityFeedEl.appendChild(empty);
		return;
	}

	for (let i = 0; i < list.length; i++) {
		const session = list[i];
		const isActive = session.sessionId === app.sessionId;
		const isRunning = isActive && app.busy;
		const status = sessionStatus(session, { isActive, isRunning });

		const card = document.createElement("button");
		card.type = "button";
		card.className = "activity-card" + (isActive ? " selected" : "");
		card.dataset.sessionId = session.sessionId;

		const left = renderActivityCardLeft(session, status, isRunning);

		const right = document.createElement("div");
		right.className = "activity-card-right";

		const title = document.createElement("span");
		title.className = "activity-card-title";
		title.textContent = sessionTitle(session);

		const subtitle = document.createElement("span");
		subtitle.className = "activity-card-subtitle";
		subtitle.textContent = sessionProjectName(session);

		right.append(title, subtitle);
		card.append(left, right);

		card.addEventListener("click", () => openSession(session.sessionId));
		activityFeedEl.appendChild(card);

		if (app.animateActivityFeed) {
			animateEnter(card, "anim-fade-up", { delay: i * 40 });
		}
	}

	app.animateActivityFeed = false;
}

export { renderTodayList };
