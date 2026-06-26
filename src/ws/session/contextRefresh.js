import { readSessionContextUsage } from "../../analytics/context.js";
import { sendContextUsage } from "../../wire/send.js";

export async function refreshContextUsage(session) {
	const sessionId = session.session?.sessionId;
	if (!sessionId || session.closed) return;

	const usage = await readSessionContextUsage(session.sessionFileIndex, sessionId, session.cwd);
	if (usage) sendContextUsage(session.ws, usage);
}

export function scheduleContextRefresh(session, delayMs = 120) {
	clearTimeout(session.contextRefreshTimer);
	session.contextRefreshTimer = setTimeout(() => {
		session.contextRefreshTimer = null;
		void refreshContextUsage(session);
	}, delayMs);
}
