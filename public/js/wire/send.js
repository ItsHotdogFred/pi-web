import { MAX_PROMPT_BYTES } from "../config.js";
import { app } from "../state/store.js";
import { inputEl, chatInputEl } from "../dom/elements.js";
import { showView } from "../ui/views.js";
import { addUserMessage, addSystemMessage } from "../chat/messages.js";
import { getAttachmentsFor, clearAttachments } from "../composer/attachments.js";
import { resizeTextarea } from "../composer/textarea.js";
import { newSession } from "../dashboard/sessions.js";

function promptPayloadBytes(trimmed, images) {
	const payload = JSON.stringify({
		type: "prompt",
		text: trimmed,
		images: images.map(({ mimeType, data }) => ({ mimeType, data })),
	});
	return new TextEncoder().encode(payload).length;
}

export function deliverPrompt(trimmed, images, fromChat = false) {
	const target = fromChat ? chatInputEl : inputEl;

	if (promptPayloadBytes(trimmed, images) > MAX_PROMPT_BYTES) {
		addSystemMessage(
			"error",
			"Error",
			`Message is too large to send (limit: ${Math.round(MAX_PROMPT_BYTES / (1024 * 1024))} MB). Remove some images and try again.`,
		);
		return;
	}

	app.chat.lastPrompt = trimmed || (images.length ? `[${images.length} image${images.length === 1 ? "" : "s"}]` : "");
	showView("chat");
	addUserMessage(trimmed, images);

	target.value = "";
	resizeTextarea(target);
	clearAttachments(target);

	app.connection.ws.send(
		JSON.stringify({
			type: "prompt",
			text: trimmed,
			images: images.map(({ mimeType, data }) => ({ mimeType, data })),
		}),
	);
}

export function sendPrompt(text, fromChat = false) {
	const target = fromChat ? chatInputEl : inputEl;
	const trimmed = text.trim();
	const attachments = [...getAttachmentsFor(target)];
	if ((!trimmed && attachments.length === 0) || !app.connection.ws || app.connection.ws.readyState !== WebSocket.OPEN || app.ui.busy) return;

	const images = attachments.map(({ name, mimeType, data, previewUrl }) => ({
		name,
		mimeType,
		data,
		previewUrl,
	}));

	if (!fromChat && (!app.session.sessionId || !app.session.freshDashboardSession)) {
		app.session.pendingDashboardPrompt = { text: trimmed, images };
		app.session.awaitingNewAgentSession = true;
		if (!app.session.creatingSession) newSession();
		return;
	}

	app.session.freshDashboardSession = false;
	deliverPrompt(trimmed, images, fromChat);
}
