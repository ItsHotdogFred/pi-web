import { PiSession } from "./PiSession.js";
import { sendJson } from "../wire/send.js";

export async function handleWebSocket(ws) {
	const pi = new PiSession(ws);

	try {
		await pi.start();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("[pi-web] failed to start pi-acp:", message);
		sendJson(ws, { type: "status", state: "error", message });
		ws.close();
		return;
	}

	ws.on("message", async (raw) => {
		let msg;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			sendJson(ws, { type: "error", message: "Invalid JSON message" });
			return;
		}

		if (msg.type === "prompt") {
			await pi.handlePrompt(msg.text ?? "", msg.images ?? []);
		} else if (msg.type === "cancel") {
			await pi.cancel();
		} else if (msg.type === "switch_session") {
			await pi.switchSession(msg.sessionId, msg.requestId ?? null);
		} else if (msg.type === "new_session") {
			await pi.newSession();
		} else if (msg.type === "compact") {
			await pi.compactSession(msg.instructions);
		} else if (msg.type === "set_model") {
			await pi.setModel(msg.value);
		} else if (msg.type === "set_cwd") {
			await pi.setProjectPath(msg.path ?? msg.cwd ?? "");
		} else if (msg.type === "permission_response") {
			pi.resolvePermissionResponse(msg.requestId, {
				optionId: msg.optionId,
				cancelled: msg.cancelled === true,
			});
		} else if (msg.type === "fetch_defaults") {
			void pi.fetchAgentDefaults();
		}
	});

	ws.on("close", () => {
		void pi.close();
	});
}
