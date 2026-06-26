import { app } from "../state/store.js";
import {
	permissionModalEl,
	permissionDialogEl,
	permissionTitleEl,
	permissionDetailsEl,
	permissionActionsEl,
} from "../dom/elements.js";
import { formatRaw } from "../utils/format.js";
import { normalizeToolName } from "../utils/tools.js";

function summarizeRawInput(rawInput) {
	if (rawInput == null) return "";
	const text = formatRaw(rawInput);
	if (!text) return "";
	const lines = text.split("\n");
	if (lines.length > 6) return `${lines.slice(0, 6).join("\n")}\n…`;
	if (text.length > 400) return `${text.slice(0, 400)}…`;
	return text;
}

function permissionToolName(tool) {
	if (!tool || typeof tool !== "object") return "tool";
	return (
		normalizeToolName(tool.title) ||
		normalizeToolName(tool.kind) ||
		normalizeToolName(tool.toolName) ||
		"tool"
	);
}

function setPermissionModalOpen(open) {
	if (!permissionModalEl) return;
	permissionModalEl.classList.toggle("hidden", !open);
	permissionModalEl.setAttribute("aria-hidden", String(!open));
}

function showPermissionModal(request) {
	if (!permissionModalEl || !permissionTitleEl || !permissionActionsEl) return;

	app.activePermissionRequest = request;
	app.permissionPreviousFocus = document.activeElement;

	const toolName = permissionToolName(request.tool);
	permissionTitleEl.textContent = `Allow ${toolName}?`;

	const details = summarizeRawInput(request.tool?.rawInput);
	if (permissionDetailsEl) {
		if (details) {
			permissionDetailsEl.textContent = details;
			permissionDetailsEl.classList.remove("hidden");
		} else {
			permissionDetailsEl.textContent = "";
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

	setPermissionModalOpen(true);
	permissionActionsEl.querySelector("button")?.focus();
}

function hidePermissionModal() {
	setPermissionModalOpen(false);
	app.activePermissionRequest = null;
	if (app.permissionPreviousFocus?.focus) {
		app.permissionPreviousFocus.focus();
	}
	app.permissionPreviousFocus = null;
}

function processPermissionQueue() {
	if (app.activePermissionRequest || app.permissionQueue.length === 0) return;
	showPermissionModal(app.permissionQueue.shift());
}

export function enqueuePermissionRequest(msg) {
	app.permissionQueue.push(msg);
	processPermissionQueue();
}

function respondToPermission(requestId, optionId) {
	if (!app.ws || app.ws.readyState !== WebSocket.OPEN) return;
	app.ws.send(JSON.stringify({ type: "permission_response", requestId, optionId }));
	hidePermissionModal();
	processPermissionQueue();
}

function cancelActivePermissionRequest() {
	if (!app.activePermissionRequest) return;
	if (app.ws?.readyState === WebSocket.OPEN) {
		app.ws.send(
			JSON.stringify({
				type: "permission_response",
				requestId: app.activePermissionRequest.requestId,
				cancelled: true,
			}),
		);
	}
	hidePermissionModal();
	processPermissionQueue();
}

export function clearPermissionRequests() {
	app.permissionQueue = [];
	if (app.activePermissionRequest) {
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
		if (event.key === "Escape") {
			event.preventDefault();
			cancelActivePermissionRequest();
			return;
		}

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
