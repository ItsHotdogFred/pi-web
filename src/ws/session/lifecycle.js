import * as acp from "@agentclientprotocol/sdk";

import { invalidateSessionFileIndex, getSessionFileIndex } from "../../sessions/sessionFiles.js";
import { enrichSessionsWithTimestamps } from "../../sessions/sessionTimestamps.js";
import {
	sendHistoryBatch,
	sendModelsFromConfigOptions,
	updateToWireEvents,
} from "../../wire/acpEvents.js";
import { sendJson } from "../../wire/send.js";
import { emitContextUsage, resetContextRefreshState, scheduleContextRefresh } from "./contextRefresh.js";
import { getHistoryCache, historyCacheKey } from "./historyCache.js";
import { withSessionLoad } from "./loadMutex.js";
import { applyPendingModel } from "./model.js";
import { ensureCachedNewSession, warmSessionCaches } from "./precache.js";
import { assertNotBusy, sendReady } from "./status.js";
import { visibleSessions } from "./visibility.js";
import { disposeActiveSession } from "./dispose.js";
import { pumpUpdates } from "./streaming.js";

async function loadSession(session, sessionId, { replay = true, requestId = null, generation = null } = {}) {
	resetContextRefreshState(session);
	const meta = requestId == null ? {} : { requestId };
	const isStale = () => generation != null && generation !== session.sessionLoadGeneration;
	const cached = replay ? await getHistoryCache(session, sessionId) : null;

	if (session.closed || isStale()) return;

	sendJson(session.ws, { type: "clear", ...meta });
	session.toolTracker.reset();
	session.startupFilter.reset();

	if (cached?.wireEvents?.length) {
		sendJson(session.ws, { type: "status", state: "loading_history", ...meta });
		sendHistoryBatch(session.ws, cached.wireEvents, meta);
	} else if (replay) {
		sendJson(session.ws, { type: "status", state: "loading_history", ...meta });
	}

	await withSessionLoad(session, async () => {
		if (session.closed || isStale()) return;

		await disposeActiveSession(session);
		if (session.closed || isStale()) return;

		session.toolTracker.reset();

		const collected = [];

		if (session.closed || isStale()) return;

		if (cached?.wireEvents?.length) {
			// Already replayed from disk above so the UI can update immediately.
		} else if (replay) {
			session.replayHandler = (params) => {
				for (const event of updateToWireEvents(params.update, session.toolTracker)) {
					collected.push(event);
				}
			};
		}

		let loadResponse = null;
		try {
			loadResponse = await session.ctx.request(acp.methods.agent.session.load, {
				sessionId,
				cwd: session.cwd,
				mcpServers: [],
				...(cached?.wireEvents?.length ? { _meta: { skipHistoryReplay: true } } : {}),
			});
		} finally {
			session.replayHandler = null;
		}

		if (session.closed || isStale()) return;

		if (collected.length) {
			sendHistoryBatch(session.ws, collected, meta);
			session.historyCache.set(historyCacheKey(session, sessionId), { wireEvents: collected });
		}

		if (loadResponse?.configOptions) {
			sendModelsFromConfigOptions(session.ws, loadResponse.configOptions);
		}

		session.session = session.ctx.attachSession({ sessionId });
		session.pumpPromise = pumpUpdates(session);

		sendJson(session.ws, {
			type: "session",
			sessionId,
			cached: Boolean(cached?.wireEvents?.length),
			cwd: session.cwd,
			...meta,
		});
		sendReady(session, meta);
		void applyPendingModel(session);
		await refreshSessions(session);
		void emitContextUsage(session);
	});
}

export async function createSession(session) {
	resetContextRefreshState(session);

	if (session.cachedNewSessionPromise) {
		await session.cachedNewSessionPromise.catch(() => {});
	}

	invalidateSessionFileIndex(session.cwd);

	await disposeActiveSession(session);
	sendJson(session.ws, { type: "clear" });
	session.toolTracker.reset();
	session.startupFilter.reset();

	let cached = false;
	if (session.cachedNewSession) {
		session.session = session.cachedNewSession;
		session.cachedNewSession = null;
		session.hiddenSessionIds.delete(session.session.sessionId);
		cached = true;
		sendModelsFromConfigOptions(session.ws, session.session.newSessionResponse.configOptions);
	} else {
		session.session = await session.ctx.buildSession(session.cwd).start();
		sendModelsFromConfigOptions(session.ws, session.session.newSessionResponse.configOptions);
	}

	session.pumpPromise = pumpUpdates(session);

	sendJson(session.ws, {
		type: "session",
		sessionId: session.session.sessionId,
		cached,
		cwd: session.cwd,
	});
	sendReady(session);
	void applyPendingModel(session);
	await refreshSessions(session);
	void emitContextUsage(session);
	void ensureCachedNewSession(session);
}

export async function refreshSessions(session) {
	try {
		const listResponse = await session.ctx.request(acp.methods.agent.session.list, {
			cwd: session.cwd,
		});
		let sessions = visibleSessions(session, listResponse.sessions ?? []);
		const activeId = session.session?.sessionId;
		if (activeId && sessions.length === 0 && !session.busy) {
			sessions = [
				{
					sessionId: activeId,
					title: null,
					cwd: session.cwd,
				},
				...sessions,
			];
		}
		session.sessionFileIndex = await getSessionFileIndex(session.cwd);
		sessions = await enrichSessionsWithTimestamps(sessions, session.sessionFileIndex);
		sendJson(session.ws, { type: "sessions", sessions });
		warmSessionCaches(session, sessions);
		scheduleContextRefresh(session, 100);
	} catch {
		// ignore list errors during refresh
	}
}

export async function switchSession(session, sessionId, requestId = null) {
	if (!sessionId) {
		sendJson(session.ws, {
			type: "error",
			message: "sessionId is required",
			...(requestId == null ? {} : { requestId }),
		});
		return;
	}
	if (!assertNotBusy(session, requestId)) return;

	const generation = ++session.sessionLoadGeneration;
	try {
		await loadSession(session, sessionId, { requestId, generation });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (generation === session.sessionLoadGeneration) {
			sendJson(session.ws, { type: "error", message, ...(requestId == null ? {} : { requestId }) });
		}
	}
}

export async function newSession(session) {
	if (!assertNotBusy(session)) return;

	session.sessionLoadGeneration++;
	try {
		await createSession(session);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
	}
}
