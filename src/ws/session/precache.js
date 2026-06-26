import { scheduleDiskPreload } from "./historyCache.js";

export async function ensureCachedNewSession(session) {
	if (session.closed || !session.ctx || session.session || session.cachedNewSession || session.cachedNewSessionPromise) {
		return;
	}

	session.cachedNewSessionPromise = (async () => {
		try {
			const newSession = await session.ctx.buildSession(session.cwd).start();
			if (!session.closed && !session.cachedNewSession) {
				session.hiddenSessionIds.add(newSession.sessionId);
				session.cachedNewSession = newSession;
			} else {
				newSession.dispose();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[pi-web] failed to precache new session:", message);
		} finally {
			session.cachedNewSessionPromise = null;
		}
	})();

	await session.cachedNewSessionPromise;
}

export function warmSessionCaches(session, sessions) {
	if (!session.session) void ensureCachedNewSession(session);

	for (const entry of sessions) {
		scheduleDiskPreload(session, entry.sessionId);
	}
}
