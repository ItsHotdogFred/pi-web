import { releaseBusy } from "./status.js";

export async function disposeActiveSession(session) {
	if (!session.session) return;

	const oldSession = session.session;
	session.session = null;
	oldSession.dispose();

	await session.pumpPromise?.catch(() => {});
	session.pumpPromise = null;
	releaseBusy(session, "cancelled");
}
