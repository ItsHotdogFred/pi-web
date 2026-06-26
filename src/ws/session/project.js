import { getGitInfo, resolveProjectPath } from "../../projects/git.js";
import { invalidateSessionFileIndex } from "../../sessions/sessionFiles.js";
import { sendJson } from "../../wire/send.js";
import { connectAgent, disconnectAgent } from "./agentConnection.js";
import { assertNotBusy } from "./status.js";

export async function setProjectPath(session, input) {
	if (!assertNotBusy(session)) return;

	let resolved;
	try {
		resolved = await resolveProjectPath(input);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
		return;
	}

	if (resolved === session.cwd) {
		sendJson(session.ws, { type: "project", ...(await getGitInfo(session.cwd)) });
		return;
	}

	session.cwd = resolved;
	session.pendingModelId = null;
	session.defaultsFetched = false;
	session.sessionLoadGeneration++;
	invalidateSessionFileIndex(resolved);

	await disconnectAgent(session);

	sendJson(session.ws, { type: "clear" });
	sendJson(session.ws, { type: "sessions", sessions: [] });
	sendJson(session.ws, { type: "commands", commands: [] });

	try {
		await connectAgent(session);
		sendJson(session.ws, { type: "project", ...(await getGitInfo(session.cwd)) });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
		sendJson(session.ws, { type: "status", state: "error", message });
	}
}
