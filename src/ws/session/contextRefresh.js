import { parseSessionContextUsage, readSessionContextUsage } from "../../analytics/context.js";
import { getSessionFileIndex } from "../../sessions/sessionFiles.js";
import { sendContextUsage } from "../../wire/send.js";

const MAX_CONTEXT_REFRESH_ATTEMPTS = 8;

export function resetContextRefreshState(session) {
	clearTimeout(session.contextRefreshTimer);
	session.contextRefreshTimer = null;
	session.contextRefreshAttempt = 0;
}

export async function emitContextUsage(session) {
	const sessionId = session.session?.sessionId;
	if (!sessionId || session.closed) return;

	try {
		if (!session.sessionFileIndex?.get(sessionId)) {
			session.sessionFileIndex = await getSessionFileIndex(session.cwd, { bust: true });
		}

		const usage =
			(await readSessionContextUsage(session.sessionFileIndex, sessionId, session.cwd)) ??
			(await parseSessionContextUsage("", session.cwd));
		sendContextUsage(session.ws, usage);
	} catch {
		try {
			sendContextUsage(session.ws, await parseSessionContextUsage("", session.cwd));
		} catch {
			// follow-up refresh may succeed once the session file exists
		}
	}
}

export async function refreshContextUsage(session) {
	const sessionId = session.session?.sessionId;
	if (!sessionId || session.closed) return;

	if (!session.sessionFileIndex?.get(sessionId)) {
		session.sessionFileIndex = await getSessionFileIndex(session.cwd, { bust: true });
	}

	const usage = await readSessionContextUsage(session.sessionFileIndex, sessionId, session.cwd);
	if (usage) {
		session.contextRefreshAttempt = 0;
		sendContextUsage(session.ws, usage);
		return;
	}

	const attempt = (session.contextRefreshAttempt ?? 0) + 1;
	session.contextRefreshAttempt = attempt;
	if (attempt < MAX_CONTEXT_REFRESH_ATTEMPTS) {
		scheduleContextRefresh(session, Math.min(150 * attempt, 1200), { attempt });
		return;
	}

	session.contextRefreshAttempt = 0;
	try {
		const fallback = await parseSessionContextUsage("", session.cwd);
		sendContextUsage(session.ws, fallback);
	} catch {
		// ignore — context dial stays empty until a later refresh
	}
}

export function scheduleContextRefresh(session, delayMs = 120, { attempt = 0 } = {}) {
	resetContextRefreshState(session);
	session.contextRefreshAttempt = attempt;
	session.contextRefreshTimer = setTimeout(() => {
		session.contextRefreshTimer = null;
		void refreshContextUsage(session);
	}, delayMs);
}
