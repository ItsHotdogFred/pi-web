import { app } from "../state/store.js";
import { basename } from "../utils/format.js";
import { icon } from "../icons/hover-icons.js";

function sortedSessions() {
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
			return icon("player", { size: 10, spin: true });
		case "active":
			return icon("sparkles", { size: 10 });
		default:
			return icon("clock", { size: 10 });
	}
}
