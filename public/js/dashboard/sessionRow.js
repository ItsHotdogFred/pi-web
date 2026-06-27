import { app } from "../state/store.js";
import { hashCode, formatRelativeTime, escapeHtml } from "../utils/format.js";
import {
	sessionTitle,
	sessionProjectName,
	sessionStatus,
	sessionBadgeIcon,
} from "./sessionHelpers.js";
import { openSession } from "./sessions.js";

let sessionArtModule = null;
async function loadSessionArt() {
	if (!sessionArtModule) sessionArtModule = await import("../session-art.js");
	return sessionArtModule;
}

export function getSessionDisplayState(session) {
	const isActive = session.sessionId === app.session.sessionId;
	const isRunning = isActive && app.ui.busy;
	const status = sessionStatus(session, { isActive, isRunning });
	return { isActive, isRunning, status };
}

function sessionAccentColor(sessionId) {
	const seed = hashCode(sessionId || "default");
	if (!sessionArtModule) {
		void loadSessionArt();
		return "var(--muted)";
	}
	return sessionArtModule.SessionArt?.accentColor(app.ui.activityArtStyle, seed) ?? "var(--muted)";
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

async function applySessionArt(left, sessionId) {
	const { SessionArt } = await loadSessionArt();
	const seed = hashCode(sessionId || "default");
	const art = document.createElement("div");
	art.className = "activity-card-art";

	const result = SessionArt.render(app.ui.activityArtStyle, seed);
	if (result.type === "css") {
		art.style.background = result.background;
	} else if (result.type === "svg") {
		art.innerHTML = result.html;
	} else if (result.type === "canvas") {
		art.appendChild(result.element);
	}

	const scrim = document.createElement("div");
	scrim.className = "activity-card-scrim";
	left.prepend(scrim);
	left.prepend(art);
	left.classList.add(`activity-card-left--${app.ui.activityArtStyle}`);
}

function renderActivityCardLeft(session, status, isRunning) {
	const left = document.createElement("div");
	left.className = "activity-card-left";

	if (isRunning) {
		left.classList.add("code-preview");
		const preview = app.chat.lastPrompt || sessionTitle(session);
		const lines = preview.split("\n").slice(0, 2);
		for (const line of lines) {
			const row = document.createElement("div");
			row.className = "code-line";
			row.textContent = line.trim();
			left.appendChild(row);
		}
		return left;
	}

	void applySessionArt(left, session.sessionId);

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
	badge.innerHTML = `${sessionBadgeIcon(status.variant)} ${escapeHtml(status.label)}`;

	content.append(meta, badge);
	left.append(content);
	return left;
}

export function createTodayItem(session) {
	const { isActive, isRunning } = getSessionDisplayState(session);

	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "today-item" + (isActive ? " active" : "");
	btn.dataset.sessionId = session.sessionId;

	const icon = isRunning ? runningIconSvg() : sessionIconSvg(sessionAccentColor(session.sessionId));
	const meta = isRunning
		? "Working…"
		: formatRelativeTime(session.updatedAt) || sessionProjectName(session);

	btn.innerHTML = `${icon}<span class="today-item-body"><span class="today-item-title">${escapeHtml(sessionTitle(session))}</span><span class="today-item-meta">${escapeHtml(meta)}</span></span>`;

	btn.addEventListener("click", () => openSession(session.sessionId));
	return btn;
}

export function createActivityCard(session) {
	const { isActive, isRunning, status } = getSessionDisplayState(session);

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
	return card;
}
