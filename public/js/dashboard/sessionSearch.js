import { app } from "../state/store.js";
import { renderSessions } from "./sessions.js";

let searchTimer = null;
let searchRequestId = 0;

export function clearSessionSearch() {
	if (searchTimer) {
		clearTimeout(searchTimer);
		searchTimer = null;
	}
	app.ui.sessionSearchResults = null;
	app.ui.sessionSearchLoading = false;
}

export function searchSessionsDebounced(query) {
	const q = query.trim();
	if (q.length < 2) {
		clearSessionSearch();
		return;
	}

	app.ui.sessionSearchLoading = true;
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => void performSearch(q), 250);
}

async function performSearch(query) {
	const requestId = ++searchRequestId;
	try {
		const params = new URLSearchParams({ q: query });
		if (app.session.cwd) params.set("cwd", app.session.cwd);
		const response = await fetch(`/api/sessions/search?${params}`);
		if (requestId !== searchRequestId) return;
		if (!response.ok) {
			app.ui.sessionSearchResults = null;
			return;
		}
		const data = await response.json();
		const items = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
		const results = new Map();
		for (const item of items) {
			if (item?.sessionId) {
				results.set(item.sessionId, {
					snippet: item.snippet ?? "",
					score: item.score ?? 0,
				});
			}
		}
		app.ui.sessionSearchResults = results;
	} catch {
		if (requestId !== searchRequestId) return;
		app.ui.sessionSearchResults = null;
	} finally {
		if (requestId === searchRequestId) {
			app.ui.sessionSearchLoading = false;
			renderSessions();
		}
	}
}
