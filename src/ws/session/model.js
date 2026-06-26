import * as acp from "@agentclientprotocol/sdk";

import { sendModelsFromConfigOptions } from "../../wire/acpEvents.js";
import { sendJson } from "../../wire/send.js";

export async function applyPendingModel(session) {
	if (!session.pendingModelId || !session.session) return;

	const value = session.pendingModelId;
	session.pendingModelId = null;

	try {
		const response = await session.ctx.request(acp.methods.agent.session.setConfigOption, {
			sessionId: session.session.sessionId,
			configId: "model",
			value,
		});
		sendModelsFromConfigOptions(session.ws, response.configOptions);
	} catch (error) {
		session.pendingModelId = value;
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
	}
}

export async function setModel(session, value) {
	if (!value) {
		sendJson(session.ws, { type: "error", message: "Model value is required" });
		return;
	}

	if (!session.session) {
		session.pendingModelId = value;
		sendJson(session.ws, { type: "models", current: value });
		return;
	}

	try {
		const response = await session.ctx.request(acp.methods.agent.session.setConfigOption, {
			sessionId: session.session.sessionId,
			configId: "model",
			value,
		});
		sendModelsFromConfigOptions(session.ws, response.configOptions);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		sendJson(session.ws, { type: "error", message });
	}
}
