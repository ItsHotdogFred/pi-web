import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

import { createAcpClient } from "../../acp/client.js";
import { spawnPiAcp } from "../../acp/process.js";
import { getSessionFileIndex } from "../../sessions/sessionFiles.js";
import { sendJson } from "../../wire/send.js";
import { cancelAllPendingPermissions } from "./permissions.js";
import { ensureCachedNewSession, warmSessionCaches } from "./precache.js";
import { clearSessionCaches, sendReady } from "./status.js";
import { visibleSessions } from "./visibility.js";
import { disposeActiveSession } from "./dispose.js";

export async function disconnectAgent(session) {
	cancelAllPendingPermissions(session);
	clearSessionCaches(session);
	await disposeActiveSession(session);
	session.replayHandler = null;

	if (session.connection) {
		session.connection.close();
		session.connection = null;
		session.ctx = null;
	}

	if (session.agentProcess && !session.agentProcess.killed) {
		session.agentProcess.kill();
		session.agentProcess = null;
	}

	await session.pumpPromise?.catch(() => {});
	session.pumpPromise = null;
	session.busy = false;
	session.toolTracker.reset();
	session.startupFilter.reset();
}

export async function connectAgent(session) {
	sendJson(session.ws, { type: "status", state: "connecting", cwd: session.cwd });

	session.agentProcess = spawnPiAcp(session.cwd);
	const input = Writable.toWeb(session.agentProcess.stdin);
	const output = Readable.toWeb(session.agentProcess.stdout);
	const stream = acp.ndJsonStream(input, output);

	const app = createAcpClient(session);
	session.connection = app.connect(stream);
	session.ctx = session.connection.agent;

	const init = await session.ctx.request(acp.methods.agent.initialize, {
		protocolVersion: acp.PROTOCOL_VERSION,
		clientCapabilities: {
			fs: {
				readTextFile: true,
				writeTextFile: true,
			},
		},
	});
	session.protocolVersion = init.protocolVersion;
	void ensureCachedNewSession(session);

	const [listResponse, sessionFileIndex] = await Promise.all([
		session.ctx.request(acp.methods.agent.session.list, {
			cwd: session.cwd,
		}),
		getSessionFileIndex(session.cwd),
	]);
	const sessions = visibleSessions(session, listResponse.sessions ?? []);
	sendJson(session.ws, { type: "sessions", sessions });

	session.sessionFileIndex = sessionFileIndex;
	sendReady(session);
	void warmSessionCaches(session, sessions);
}

export async function start(session) {
	try {
		await connectAgent(session);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "status", state: "error", message });
		throw error;
	}
}

export async function closeSession(session) {
	session.closed = true;
	clearTimeout(session.contextRefreshTimer);
	session.contextRefreshTimer = null;
	await disconnectAgent(session);
}
