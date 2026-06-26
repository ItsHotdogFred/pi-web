import * as acp from "@agentclientprotocol/sdk";

import { invalidateContributionsCache } from "../../analytics/contributions.js";
import { sendJson } from "../../wire/send.js";
import { cancelAllPendingPermissions } from "./permissions.js";
import { createSession, refreshSessions } from "./lifecycle.js";
import { assertNotBusy } from "./status.js";

export async function handlePrompt(session, text, images = []) {
	if (!assertNotBusy(session)) return;

	if (!session.session) {
		try {
			await createSession(session);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			sendJson(session.ws, { type: "error", message });
			return;
		}
	}

	const trimmed = (text ?? "").trim();
	const imageBlocks = Array.isArray(images)
		? images.filter((image) => image?.data && image?.mimeType)
		: [];

	if (!trimmed && imageBlocks.length === 0) return;

	session.busy = true;
	sendJson(session.ws, { type: "status", state: "busy" });

	try {
		const prompt =
			imageBlocks.length === 0
				? trimmed
				: [
						...(trimmed ? [{ type: "text", text: trimmed }] : []),
						...imageBlocks.map((image) => ({
							type: "image",
							mimeType: image.mimeType,
							data: image.data,
						})),
					];

		await session.session.prompt(prompt);
		invalidateContributionsCache(session.cwd);
		void refreshSessions(session);
	} catch (error) {
		session.busy = false;
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
		sendJson(session.ws, { type: "status", state: "ready" });
	}
}

export async function compactSession(session, customInstructions) {
	if (!assertNotBusy(session)) return;

	if (!session.session) {
		sendJson(session.ws, { type: "error", message: "No active session to compact" });
		return;
	}

	const instructions = typeof customInstructions === "string" ? customInstructions.trim() : "";
	const prompt = instructions ? `/compact ${instructions}` : "/compact";

	session.busy = true;
	sendJson(session.ws, { type: "status", state: "busy" });

	try {
		await session.session.prompt(prompt);
		invalidateContributionsCache(session.cwd);
		void refreshSessions(session);
	} catch (error) {
		session.busy = false;
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
		sendJson(session.ws, { type: "status", state: "ready" });
	}
}

export async function cancel(session) {
	if (!session.connection || !session.session) return;
	cancelAllPendingPermissions(session);
	try {
		await session.connection.agent.notify(acp.methods.agent.session.cancel, {
			sessionId: session.session.sessionId,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
	}
}
