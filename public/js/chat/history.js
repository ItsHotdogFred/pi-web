import { app } from "../state/store.js";
import { addUserMessage, finalizeAssistantTurn, scrollToBottomAfterLayout } from "./messages.js";
import { rebuildPromptHistory } from "./promptHistory.js";
import { ingestEvent } from "./ingestEvent.js";
import { resetTodoDisplayState } from "./todoPanel.js";

export function clearPendingUserMessage() {
	app.session.pendingUserMessage = null;
}

export function flushUserMessage() {
	if (!app.session.pendingUserMessage) return;
	const { text, images } = app.session.pendingUserMessage;
	if (text || images.length) {
		finalizeAssistantTurn();
		addUserMessage(text, images);
	}
	clearPendingUserMessage();
}

export function appendUserChunk(msg) {
	const messageId = msg.messageId ?? null;

	if (app.session.pendingUserMessage && messageId && app.session.pendingUserMessage.messageId !== messageId) {
		flushUserMessage();
	}

	if (!app.session.pendingUserMessage) {
		app.session.pendingUserMessage = { messageId, text: "", images: [] };
	}

	if (msg.text) app.session.pendingUserMessage.text += msg.text;
	if (msg.image?.data && msg.image?.mimeType) {
		app.session.pendingUserMessage.images.push({
			mimeType: msg.image.mimeType,
			data: msg.image.data,
		});
	}
}

function mergeConsecutiveHistoryEvents(events) {
	const merged = [];
	for (const event of events) {
		const prev = merged[merged.length - 1];
		if (event.type === "thought" && prev?.type === "thought") {
			prev.text = `${prev.text ?? ""}${event.text ?? ""}`;
			continue;
		}
		merged.push({ ...event });
	}
	return merged;
}

function applyHistoryEvent(event) {
	ingestEvent(event, { mode: "history" });
}

export function applyHistoryBatch(events) {
	if (!Array.isArray(events) || events.length === 0) return;
	app.session.loadingHistory = true;
	app.session.batchHistoryMode = true;
	for (const event of mergeConsecutiveHistoryEvents(events)) applyHistoryEvent(event);
	flushUserMessage();
	finalizeAssistantTurn();
	app.session.batchHistoryMode = false;
	resetTodoDisplayState();
	rebuildPromptHistory();
	if (!app.session.activeSessionSwitchRequestId) {
		scrollToBottomAfterLayout();
	}
}
