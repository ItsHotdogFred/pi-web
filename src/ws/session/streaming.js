import { forwardSessionUpdate } from "../../wire/acpEvents.js";
import { sendJson } from "../../wire/send.js";
import { scheduleContextRefresh } from "./contextRefresh.js";
import { invalidateHistoryCache } from "./historyCache.js";
import { releaseBusy } from "./status.js";

export async function pumpUpdates(session) {
	const activeSession = session.session;
	while (!session.closed && session.session === activeSession && activeSession) {
		try {
			const message = await activeSession.nextUpdate();
			if (message.kind === "session_update") {
				forwardSessionUpdate(message.update, session.ws, {
					toolTracker: session.toolTracker,
					startupFilter: session.startupFilter,
				});
				if (session.busy && message.update.sessionUpdate !== "usage_update") {
					scheduleContextRefresh(session, 400);
				}
			} else if (message.kind === "stop") {
				session.busy = false;
				invalidateHistoryCache(session, activeSession.sessionId);
				sendJson(session.ws, {
					type: "done",
					stopReason: message.stopReason,
				});
				scheduleContextRefresh(session, 250);
			}
		} catch (error) {
			if (session.closed || session.session !== activeSession) break;
			const msg = error instanceof Error ? error.message : String(error);
			sendJson(session.ws, { type: "error", message: msg });
			releaseBusy(session, "error");
			break;
		}
	}
}
