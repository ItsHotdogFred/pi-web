import { app } from "../state/store.js";
import { basename } from "../utils/format.js";

export function sortedSessions() {
	return [...app.sessions].sort(
		(a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
	);
}

export function filteredSessions() {
	const q = app.searchQuery.trim().toLowerCase();
	if (!q) return sortedSessions();
	return sortedSessions().filter((s) => (s.title || "New Agent").toLowerCase().includes(q));
}

export function sessionTitle(session) {
	return session.title || "New Agent";
}

export function sessionProjectName(session) {
	return basename(session.cwd || app.cwd || app.gitInfo.project);
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
