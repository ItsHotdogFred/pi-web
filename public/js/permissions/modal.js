import { app } from "../state/store.js";
import {
	$,
	permissionModalEl,
	permissionDialogEl,
	permissionTitleEl,
	permissionDetailsEl,
	permissionActionsEl,
} from "../dom/elements.js";
import { normalizeToolName } from "../utils/tools.js";
import { createModal } from "../ui/modal.js";
import { setTabStatus, clearTabPermissionStatus } from "../ui/tabStatus.js";
import { buildPermissionPreview } from "./preview.js";

function permissionToolName(tool) {
	if (!tool || typeof tool !== "object") return "tool";
	return (
		normalizeToolName(tool.title) ||
		normalizeToolName(tool.kind) ||
		normalizeToolName(tool.toolName) ||
		"tool"
	);
}

let permissionModal = null;

function getPermissionModal() {
	if (!permissionModal && permissionModalEl) {
		permissionModal = createModal({
			el: permissionModalEl,
			backdropEl: $("permission-backdrop"),
			onClose: () => cancelActivePermissionRequest(),
		});
	}
	return permissionModal;
}

function showPermissionModal(request) {
	if (!permissionModalEl || !permissionTitleEl || !permissionActionsEl) return;

	app.permissions.activeRequest = request;

	const toolName = permissionToolName(request.tool);
	permissionTitleEl.textContent = `Allow ${toolName}?`;

	const preview = buildPermissionPreview(request.tool);
	if (permissionDetailsEl) {
		if (preview) {
			if (preview.type === "text") {
				permissionDetailsEl.textContent = preview.text;
			} else {
				permissionDetailsEl.innerHTML = preview.html;
			}
			permissionDetailsEl.classList.remove("hidden");
		} else {
			permissionDetailsEl.replaceChildren();
			permissionDetailsEl.classList.add("hidden");
		}
	}

	permissionActionsEl.replaceChildren();
	for (const option of request.options ?? []) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "permission-btn";
		if (option.kind?.startsWith("reject")) {
			btn.classList.add("permission-btn--deny");
		} else {
			btn.classList.add("permission-btn--allow");
			if (option.kind === "allow_always") btn.classList.add("permission-btn--always");
		}
		btn.textContent = option.name ?? option.kind ?? "Choose";
		btn.addEventListener("click", () => respondToPermission(request.requestId, option.optionId));
		permissionActionsEl.appendChild(btn);
	}

	getPermissionModal().open();
	permissionActionsEl.querySelector("button")?.focus();
	setTabStatus("permission");
}

function hidePermissionModal() {
	getPermissionModal()?.close();
	app.permissions.activeRequest = null;
	clearTabPermissionStatus();
}

function processPermissionQueue() {
	if (app.permissions.activeRequest || app.permissions.queue.length === 0) return;
	showPermissionModal(app.permissions.queue.shift());
}

export function enqueuePermissionRequest(msg) {
	app.permissions.queue.push(msg);
	processPermissionQueue();
}

function respondToPermission(requestId, optionId) {
	if (!app.connection.ws || app.connection.ws.readyState !== WebSocket.OPEN) return;
	app.connection.ws.send(JSON.stringify({ type: "permission_response", requestId, optionId }));
	hidePermissionModal();
	processPermissionQueue();
}

function cancelActivePermissionRequest() {
	if (!app.permissions.activeRequest) return;
	if (app.connection.ws?.readyState === WebSocket.OPEN) {
		app.connection.ws.send(
			JSON.stringify({
				type: "permission_response",
				requestId: app.permissions.activeRequest.requestId,
				cancelled: true,
			}),
		);
	}
	hidePermissionModal();
	processPermissionQueue();
}

export function clearPermissionRequests() {
	app.permissions.queue = [];
	if (app.permissions.activeRequest) {
		hidePermissionModal();
	}
}

export function formatPermissionResult(msg) {
	const tool = permissionToolName(typeof msg.tool === "object" ? msg.tool : { title: msg.tool });
	const choice = String(msg.choice ?? "").toLowerCase();
	const kind = String(msg.optionId ?? "").toLowerCase();
	if (choice.includes("deny") || choice.includes("reject") || kind.includes("reject")) {
		return `Denied <strong>${tool}</strong>`;
	}
	return `Allowed <strong>${tool}</strong>`;
}

export function initPermissionModal() {
	if (!permissionDialogEl || !permissionActionsEl) return;

	permissionDialogEl.addEventListener("keydown", (event) => {
		if (event.key !== "Tab") return;

		const focusable = [...permissionActionsEl.querySelectorAll("button")];
		if (focusable.length === 0) return;

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	});
}
