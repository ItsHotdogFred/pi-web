import { app } from "../state/store.js";
import { renderSessions } from "./sessions.js";

export async function fetchSessionStats() {
	try {
		const params = new URLSearchParams();
		if (app.session.cwd) params.set("cwd", app.session.cwd);
		const query = params.toString();
		const response = await fetch(`/api/sessions/stats${query ? `?${query}` : ""}`);
		if (!response.ok) return;
		const data = await response.json();
		const stats = data?.stats ?? {};
		const lineStats = {};
		for (const [sessionId, entry] of Object.entries(stats)) {
			lineStats[sessionId] = {
				linesAdded: entry?.linesAdded ?? 0,
				linesRemoved: entry?.linesRemoved ?? 0,
			};
			if (entry?.updatedAt) {
				const session = app.session.sessions.find((s) => s.sessionId === sessionId);
				if (session) session.updatedAt = entry.updatedAt;
			}
		}
		app.session.lineStats = lineStats;
		renderSessions();
	} catch {
		// keep existing stats
	}
}
