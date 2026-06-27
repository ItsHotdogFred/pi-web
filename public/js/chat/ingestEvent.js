import { shouldSkipStartupContent } from "../utils/tools.js";
import { renderMarkdown } from "../utils/markdown.js";
import {
	addSystemMessage,
	appendAssistantChunk,
	appendThoughtChunk,
	finalizeAssistantTurn,
} from "./messages.js";
import { updateToolCard } from "./toolCard.js";
import { renderPlanPanel, resetPlanPanel } from "./planPanel.js";
import { appendUserChunk, flushUserMessage } from "./history.js";
import { onAgentResponseStart, syncTodoFromTool } from "./todoPanel.js";

export function ingestEvent(event, { mode = "stream" } = {}) {
	switch (event.type) {
		case "user_chunk":
			if (mode === "history") resetPlanPanel();
			appendUserChunk(event);
			break;
		case "chunk": {
			if (mode === "history") flushUserMessage();
			else onAgentResponseStart();
			const chunkText = event.text ?? "";
			if (!chunkText || shouldSkipStartupContent(chunkText)) break;
			if (mode === "history") {
				finalizeAssistantTurn();
				addSystemMessage("assistant", "", renderMarkdown(chunkText));
				finalizeAssistantTurn();
			} else {
				appendAssistantChunk(chunkText);
			}
			break;
		}
		case "thought": {
			if (mode === "history") flushUserMessage();
			else onAgentResponseStart();
			const thoughtText = event.text ?? "";
			if (!thoughtText || shouldSkipStartupContent(thoughtText)) break;
			if (mode === "history") {
				finalizeAssistantTurn();
				addSystemMessage("thought", "Thinking", renderMarkdown(thoughtText));
				finalizeAssistantTurn();
			} else {
				appendThoughtChunk(thoughtText);
			}
			break;
		}
		case "tool":
			if (mode === "history") flushUserMessage();
			if (mode === "history") finalizeAssistantTurn();
			updateToolCard(event);
			syncTodoFromTool(event);
			break;
		case "plan":
			if (mode === "history") flushUserMessage();
			if (mode === "history") finalizeAssistantTurn();
			renderPlanPanel(event.entries);
			break;
	}
}
