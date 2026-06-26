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

export async function primeAgentDefaults(session, probe) {
	const replayDefaults = (params) => {
		forwardDefaultsUpdate(params.update, session.ws);
	};

	session.replayHandler = replayDefaults;
	try {
		sendModelsFromConfigOptions(session.ws, probe.newSessionResponse.configOptions);
		await drainProbeDefaults(session, probe);
		session.defaultsFetched = true;
	} finally {
		session.replayHandler = null;
	}
}
