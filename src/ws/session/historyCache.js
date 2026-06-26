import { readFile } from "node:fs/promises";

import { parseSessionJsonl } from "../../wire/acpEvents.js";

export function historyCacheKey(session, sessionId) {
	return `${session.cwd}:${sessionId}`;
}

export function invalidateHistoryCache(session, sessionId) {
	if (!sessionId) return;
	session.historyCache.delete(historyCacheKey(session, sessionId));
}

export function scheduleDiskPreload(session, sessionId) {
	const key = historyCacheKey(session, sessionId);
	if (session.historyCache.has(key) || session.historyCachePromises.has(key)) return;

	const filePath = session.sessionFileIndex?.get(sessionId);
	if (!filePath) return;

	const promise = readFile(filePath, "utf8")
		.then((content) => {
			if (session.closed) return;
			const wireEvents = parseSessionJsonl(content);
			session.historyCache.set(key, { wireEvents });
		})
		.catch(() => {});

	session.historyCachePromises.set(key, promise);
	void promise.finally(() => session.historyCachePromises.delete(key));
}

export async function getHistoryCache(session, sessionId) {
	const key = historyCacheKey(session, sessionId);
	const pending = session.historyCachePromises.get(key);
	if (pending) await pending.catch(() => {});

	let cached = session.historyCache.get(key);
	if (cached?.wireEvents) return cached;

	const filePath = session.sessionFileIndex?.get(sessionId);
	if (!filePath) return null;

	try {
		const content = await readFile(filePath, "utf8");
		const wireEvents = parseSessionJsonl(content);
		cached = { wireEvents };
		session.historyCache.set(key, cached);
		return cached;
	} catch {
		return null;
	}
}
