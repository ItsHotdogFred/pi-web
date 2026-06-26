import { sendJson } from "../../wire/send.js";

const BUSY_MESSAGE = "Pi is still working on the previous message";

export function assertNotBusy(session, requestId = null) {
	if (!session.busy) return true;
	sendJson(session.ws, {
		type: "error",
		message: BUSY_MESSAGE,
		...(requestId == null ? {} : { requestId }),
	});
	return false;
}

export function sendReady(session, extra = {}) {
	sendJson(session.ws, {
		type: "status",
		state: "ready",
		sessionId: session.session?.sessionId,
		protocolVersion: session.protocolVersion,
		cwd: session.cwd,
		...extra,
	});
}

export function releaseBusy(session, stopReason = "end_turn") {
	if (!session.busy) return;
	session.busy = false;
	sendJson(session.ws, {
		type: "done",
		stopReason,
	});
}

export function clearSessionCaches(session) {
	if (session.cachedNewSession) {
		session.cachedNewSession.dispose();
		session.cachedNewSession = null;
	}

	clearTimeout(session.contextRefreshTimer);
	session.contextRefreshTimer = null;
	session.cachedNewSessionPromise = null;
	session.hiddenSessionIds.clear();
	session.historyCache.clear();
	session.historyCachePromises.clear();
	session.preloadChain = Promise.resolve();
	session.sessionFileIndex = new Map();
	session.defaultsFetched = false;
}
