import { permissionOptionLabel } from "../../acp/client.js";
import { sendJson } from "../../wire/send.js";

export function resolvePermissionResponse(session, requestId, { optionId, cancelled = false } = {}) {
	const pending = session.pendingPermissions.get(requestId);
	if (!pending) return false;

	clearTimeout(pending.timeout);
	session.pendingPermissions.delete(requestId);

	if (cancelled || !optionId) {
		pending.resolve({ outcome: { outcome: "cancelled" } });
		return true;
	}

	const selected = pending.options.find((option) => option.optionId === optionId);
	if (!selected) {
		pending.resolve({ outcome: { outcome: "cancelled" } });
		return true;
	}

	sendJson(session.ws, {
		type: "permission",
		tool: pending.tool.title ?? pending.tool.kind ?? "tool",
		choice: permissionOptionLabel(selected),
		optionId: selected.optionId,
	});

	pending.resolve({
		outcome: {
			outcome: "selected",
			optionId: selected.optionId,
		},
	});
	return true;
}

export function cancelAllPendingPermissions(session) {
	for (const [, pending] of session.pendingPermissions) {
		clearTimeout(pending.timeout);
		pending.resolve({ outcome: { outcome: "cancelled" } });
	}
	session.pendingPermissions.clear();
}
