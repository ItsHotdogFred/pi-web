import { app } from "../state/store.js";
import { basename } from "../utils/format.js";

export function sortedSessions() {
	return [...app.session.sessions].sort(
		(a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
	);
}

function sessionTitleLower(session) {
	return (session.title || "New Agent").toLowerCase();
}

function titleMatches(session, q) {
	return sessionTitleLower(session).includes(q);
}

function searchScore(session, q, results) {
	if (results?.has(session.sessionId)) return results.get(session.sessionId).score ?? 0;
	if (titleMatches(session, q)) return 100;
	return 0;
}

export function filteredSessions() {
	const q = app.ui.searchQuery.trim().toLowerCase();
	if (!q) return sortedSessions();

	if (q.length >= 2) {
		const results = app.ui.sessionSearchResults;
		const matches = sortedSessions().filter(
			(s) => titleMatches(s, q) || (results && results.has(s.sessionId)),
		);
		return matches.sort((a, b) => {
			const scoreDiff = searchScore(b, q, results) - searchScore(a, q, results);
			if (scoreDiff !== 0) return scoreDiff;
			return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
		});
	}

	return sortedSessions().filter((s) => titleMatches(s, q));
}

export function sessionTitle(session) {
	return session.title || "New Agent";
}

export function sessionProjectName(session) {
	return basename(session.cwd || app.session.cwd || app.project.gitInfo.project);
}

export function sessionStatus(session, { isActive, isRunning }) {
	if (isRunning) return { variant: "running", label: "Running" };
	if (isActive) return { variant: "active", label: "Active" };
	return { variant: "saved", label: "Saved" };
}

export function sessionBadgeIcon(variant) {
	switch (variant) {
		case "running":
			return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="5" r="1.25" fill="currentColor"/></svg>`;
		case "active":
			return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="2.25" fill="currentColor"/></svg>`;
		default:
			return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 3v2.5l1.5 1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
	}
}
