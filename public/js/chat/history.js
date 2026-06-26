import { app } from "../state/store.js";
import { shouldSkipStartupContent } from "../utils/tools.js";
import { renderMarkdown } from "../utils/markdown.js";
import {
	addUserMessage,
	addSystemMessage,
	finalizeAssistantTurn,
	scrollToBottom,
} from "./messages.js";
import { updateToolCard, renderPlanPanel, resetPlanPanel } from "./tools.js";

export function clearPendingUserMessage() {
	app.pendingUserMessage = null;
}

export function flushUserMessage() {
	if (!app.pendingUserMessage) return;
	const { text, images } = app.pendingUserMessage;
	if (text || images.length) {
		finalizeAssistantTurn();
		addUserMessage(text, images);
	}
	clearPendingUserMessage();
}

export function appendUserChunk(msg) {
	const messageId = msg.messageId ?? null;

	if (app.pendingUserMessage && messageId && app.pendingUserMessage.messageId !== messageId) {
		flushUserMessage();
	}

	if (!app.pendingUserMessage) {
		app.pendingUserMessage = { messageId, text: "", images: [] };
	}

	if (msg.text) app.pendingUserMessage.text += msg.text;
	if (msg.image?.data && msg.image?.mimeType) {
		app.pendingUserMessage.images.push({
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
	switch (event.type) {
		case "user_chunk":
			resetPlanPanel();
			appendUserChunk(event);
			break;
		case "chunk": {
			flushUserMessage();
			const chunkText = event.text ?? "";
			if (chunkText && !shouldSkipStartupContent(chunkText)) {
				finalizeAssistantTurn();
				addSystemMessage("assistant", "", renderMarkdown(chunkText));
				finalizeAssistantTurn();
			}
			break;
		}
		case "thought": {
			flushUserMessage();
			const thoughtText = event.text ?? "";
			if (thoughtText && !shouldSkipStartupContent(thoughtText)) {
				finalizeAssistantTurn();
				addSystemMessage("thought", "Thinking", renderMarkdown(thoughtText));
				finalizeAssistantTurn();
			}
			break;
		}
		case "tool":
			flushUserMessage();
			finalizeAssistantTurn();
			updateToolCard(event);
			break;
		case "plan":
			flushUserMessage();
			finalizeAssistantTurn();
			renderPlanPanel(event.entries);
			break;
	}
}

export function applyHistoryBatch(events) {
	if (!Array.isArray(events) || events.length === 0) return;
	app.loadingHistory = true;
	app.batchHistoryMode = true;
	for (const event of mergeConsecutiveHistoryEvents(events)) applyHistoryEvent(event);
	flushUserMessage();
	finalizeAssistantTurn();
	app.batchHistoryMode = false;
	scrollToBottom();
}
