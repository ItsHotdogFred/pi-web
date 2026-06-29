import { app } from "../state/store.js";
import { hashCode, formatRelativeTime, escapeHtml } from "../utils/format.js";
import { icon } from "../icons/hover-icons.js";
import {
	sessionTitle,
	sessionProjectName,
	sessionStatus,
	sessionBadgeIcon,
} from "./sessionHelpers.js";
import { openSession } from "./sessions.js";

function lineStatsHtml(sessionId) {
	const stats = app.session.lineStats[sessionId];
	if (!stats) return "";
	const added = stats.linesAdded ?? 0;
	const removed = stats.linesRemoved ?? 0;
	if (added === 0 && removed === 0) return "";
	let html = '<span class="session-line-stats">';
	if (added > 0) html += `<span class="stat-add">+${added}</span>`;
	if (removed > 0) html += `${added > 0 ? " " : ""}<span class="stat-del">−${removed}</span>`;
	html += "</span>";
	return html;
}

function searchSnippet(sessionId) {
	const q = app.ui.searchQuery.trim();
	if (q.length < 2) return null;
	return app.ui.sessionSearchResults?.get(sessionId)?.snippet ?? null;
}

let sessionArtModule = null;
async function loadSessionArt() {
	if (!sessionArtModule) sessionArtModule = await import("../session-art.js");
	return sessionArtModule;
}

function getSessionDisplayState(session) {
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
	return icon("sparkles", { size: 14, className: "today-item-icon", style: `color:${color}` });
}

function runningIconSvg() {
	return icon("refresh", { size: 14, className: "today-item-icon running", spin: true });
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
	const snippet = searchSnippet(session.sessionId);
	project.textContent = snippet || sessionProjectName(session);

	meta.append(time, project);

	const statsEl = document.createElement("span");
	statsEl.className = "activity-card-line-stats";
	statsEl.innerHTML = lineStatsHtml(session.sessionId);
	if (statsEl.innerHTML) meta.append(statsEl);

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
	const metaText = isRunning
		? "Working…"
		: formatRelativeTime(session.updatedAt) || sessionProjectName(session);
	const stats = lineStatsHtml(session.sessionId);

	btn.innerHTML = `${icon}<span class="today-item-body"><span class="today-item-title">${escapeHtml(sessionTitle(session))}</span><span class="today-item-meta">${escapeHtml(metaText)}${stats ? ` ${stats}` : ""}</span></span>`;

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
	const cardSnippet = searchSnippet(session.sessionId);
	subtitle.textContent = cardSnippet || sessionProjectName(session);
	if (cardSnippet) subtitle.classList.add("activity-card-search-snippet");

	const cardStats = document.createElement("span");
	cardStats.className = "activity-card-subtitle-stats";
	cardStats.innerHTML = lineStatsHtml(session.sessionId);

	right.append(title, subtitle);
	if (cardStats.innerHTML) right.append(cardStats);
	card.append(left, right);

	card.addEventListener("click", () => openSession(session.sessionId));
	return card;
}
