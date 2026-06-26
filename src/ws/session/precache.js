import { primeAgentDefaults } from "./defaults.js";
import { scheduleDiskPreload } from "./historyCache.js";

export async function ensureCachedNewSession(session) {
	if (session.closed || !session.ctx || session.session || session.cachedNewSession || session.cachedNewSessionPromise) {
		return;
	}

	session.cachedNewSessionPromise = (async () => {
		let newSession = null;
		try {
			newSession = await session.ctx.buildSession(session.cwd).start();
			if (!session.closed && !session.cachedNewSession) {
				await primeAgentDefaults(session, newSession);
				session.hiddenSessionIds.add(newSession.sessionId);
				session.cachedNewSession = newSession;
				newSession = null;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[pi-web] failed to precache new session:", message);
		} finally {
			newSession?.dispose();
			session.cachedNewSessionPromise = null;
		}
	})();

	await session.cachedNewSessionPromise;
}

export async function fetchAgentDefaults(session) {
	if (session.defaultsFetched || session.closed || !session.ctx) return;
	await ensureCachedNewSession(session);
}

export function warmSessionCaches(session, sessions) {
	if (!session.session) void ensureCachedNewSession(session);

	for (const entry of sessions) {
		scheduleDiskPreload(session, entry.sessionId);
	}
}
