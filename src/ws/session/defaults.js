import { forwardDefaultsUpdate, sendModelsFromConfigOptions } from "../../wire/acpEvents.js";

export async function drainProbeDefaults(session, probe, timeoutMs = 3000) {
	const deadline = Date.now() + timeoutMs;
	let lastCommandUpdateAt = 0;

	while (Date.now() < deadline) {
		try {
			const msg = await Promise.race([
				probe.nextUpdate(),
				new Promise((resolve) => setTimeout(() => resolve(null), 200)),
			]);
			if (!msg) {
				if (lastCommandUpdateAt && Date.now() - lastCommandUpdateAt > 500) {
					return;
				}
				continue;
			}
			if (msg.kind === "session_update") {
				forwardDefaultsUpdate(msg.update, session.ws);
				if (msg.update.sessionUpdate === "available_commands_update") {
					lastCommandUpdateAt = Date.now();
				}
			}
		} catch {
			break;
		}
	}
}

export async function fetchAgentDefaults(session) {
	if (session.defaultsFetched || session.defaultsFetchPromise || session.closed || !session.ctx) {
		return;
	}

	session.defaultsFetchPromise = (async () => {
		const replayDefaults = (params) => {
			forwardDefaultsUpdate(params.update, session.ws);
		};

		let probe = null;
		try {
			session.replayHandler = replayDefaults;
			probe = await session.ctx.buildSession(session.cwd).start();
			session.hiddenSessionIds.add(probe.sessionId);
			sendModelsFromConfigOptions(session.ws, probe.newSessionResponse.configOptions);
			await drainProbeDefaults(session, probe);
			session.defaultsFetched = true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[pi-web] failed to fetch agent defaults:", message);
		} finally {
			session.replayHandler = null;
			probe?.dispose();
			session.defaultsFetchPromise = null;
		}
	})();

	await session.defaultsFetchPromise;
}
