import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as acp from "@agentclientprotocol/sdk";

import { PERMISSION_TIMEOUT_MS, PI_WEB_AUTO_APPROVE } from "../config.js";
import { sendJson, truncateWire } from "../wire/send.js";

const PERMISSION_KIND_LABELS = {
	allow_once: "Allow once",
	allow_always: "Always allow",
	allow: "Allow",
	reject_once: "Deny",
	reject_always: "Always deny",
	reject: "Deny",
};

export function permissionOptionLabel(option) {
	if (option?.kind && PERMISSION_KIND_LABELS[option.kind]) {
		return PERMISSION_KIND_LABELS[option.kind];
	}
	return option?.name ?? option?.kind ?? "Choose";
}

export function createAcpClient(piSession) {
	const app = acp
		.client({ name: "pi-web" })
		.onRequest(acp.methods.client.session.requestPermission, (ctx) => {
			const preferred =
				ctx.params.options.find((option) => option.kind === "allow_once") ??
				ctx.params.options.find((option) => option.kind === "allow") ??
				ctx.params.options[0];

			if (PI_WEB_AUTO_APPROVE) {
				sendJson(piSession.ws, {
					type: "permission",
					tool: ctx.params.toolCall.title,
					choice: preferred?.name ?? "auto",
					optionId: preferred?.optionId,
				});

				return {
					outcome: {
						outcome: "selected",
						optionId: preferred.optionId,
					},
				};
			}

			const requestId = randomUUID();
			const tool = {
				title: ctx.params.toolCall.title,
				toolCallId: ctx.params.toolCall.toolCallId,
				kind: ctx.params.toolCall.kind,
				rawInput: truncateWire(ctx.params.toolCall.rawInput),
			};
			const options = ctx.params.options.map((option) => ({
				optionId: option.optionId,
				name: permissionOptionLabel(option),
				kind: option.kind,
			}));

			sendJson(piSession.ws, {
				type: "permission_request",
				requestId,
				tool,
				options,
			});

			return new Promise((resolve) => {
				const timeout = setTimeout(() => {
					piSession.pendingPermissions.delete(requestId);
					resolve({ outcome: { outcome: "cancelled" } });
				}, PERMISSION_TIMEOUT_MS);

				piSession.pendingPermissions.set(requestId, {
					resolve,
					timeout,
					tool,
					options: ctx.params.options,
				});
			});
		})
		.onRequest(acp.methods.client.fs.readTextFile, async (ctx) => {
			const content = await readFile(ctx.params.path, "utf8");
			return { content };
		})
		.onRequest(acp.methods.client.fs.writeTextFile, async (ctx) => {
			await writeFile(ctx.params.path, ctx.params.content, "utf8");
			return {};
		})
		.onNotification(acp.methods.client.session.update, (ctx) => {
			if (piSession.replayHandler) {
				piSession.replayHandler(ctx.params);
			}
		});

	return app;
}
