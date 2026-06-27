import { app } from "../state/store.js";
import { $, messagesEl, inputEl, chatInputEl } from "../dom/elements.js";
import { animateEnter } from "../utils/animation.js";
import { escapeHtml } from "../utils/format.js";
import { enhanceRenderedMarkdown, renderMarkdown } from "../utils/markdown.js";
import { resetContextUsage } from "../context/dial.js";
import { clearChangedFiles } from "./fileContext.js";
import { resetPlanPanel } from "./planPanel.js";
import { clearPendingUserMessage } from "./history.js";
import { clearPromptHistory, registerUserPrompt, rebuildPromptHistory } from "./promptHistory.js";

export function getActiveInput() {
	return app.ui.currentView === "chat" ? chatInputEl : inputEl;
}

export function scrollToBottom() {
	if (app.session.batchHistoryMode) return;
	const area = $("chat-area");
	if (area) area.scrollTop = area.scrollHeight;
}

export function clearChat() {
	messagesEl.replaceChildren();
	app.chat.toolCards.clear();
	clearPendingUserMessage();
	clearPromptHistory();
	finalizeAssistantTurn();
	resetPlanPanel();
	clearChangedFiles();
	resetContextUsage();
}

export { rebuildPromptHistory };

export function addUserMessage(text, images = []) {
	resetPlanPanel();
	const article = document.createElement("article");
	article.className = "msg msg-user";
	const imagesHtml = images.length
		? `<div class="msg-images">${images
				.map(
					(image) =>
						`<img src="${image.previewUrl || `data:${image.mimeType};base64,${image.data}`}" alt="${escapeHtml(image.name || "Attached image")}" />`,
				)
				.join("")}</div>`
		: "";
	const textHtml = text ? `<div class="msg-content">${renderMarkdown(text)}</div>` : "";
	article.innerHTML = `${imagesHtml}${textHtml}`;
	messagesEl.appendChild(article);
	registerUserPrompt(article, text, { hasImages: images.length > 0 });
	animateEnter(article, "anim-fade-up");
	scrollToBottom();
}

function streamingMessageAnchor() {
	return app.chat.assistantBlock;
}

export function appendChatNode(node, { beforeStreaming = false } = {}) {
	const anchor = beforeStreaming ? streamingMessageAnchor() : null;
	if (anchor?.isConnected) messagesEl.insertBefore(node, anchor);
	else messagesEl.appendChild(node);
	scrollToBottom();
}

export function addSystemMessage(kind, label, html) {
	const article = document.createElement("article");
	article.className = `msg msg-${kind}`;
	const labelHtml = label ? `<span class="msg-label">${label}</span>` : "";
	article.innerHTML = `${labelHtml}<div class="msg-content">${html}</div>`;
	if (kind === "assistant" || kind === "thought") {
		enhanceRenderedMarkdown(article.querySelector(".msg-content"));
	}
	appendChatNode(article);
	animateEnter(article, "anim-fade-up");
	return article;
}

const MARKDOWN_RENDER_DELAY_MS = 75;

let markdownRenderScheduled = false;
let markdownRenderTimer = null;
const pendingMarkdownBlocks = new Map();

export function flushMarkdownRender({ renderMermaid = false } = {}) {
	if (markdownRenderTimer !== null) {
		clearTimeout(markdownRenderTimer);
		markdownRenderTimer = null;
	}
	markdownRenderScheduled = false;
	if (pendingMarkdownBlocks.size === 0) return;
	for (const [block, getText] of pendingMarkdownBlocks) {
		const content = block.querySelector(".msg-content");
		if (!content?.isConnected) continue;
		content.innerHTML = renderMarkdown(getText());
		if (block.classList.contains("msg-assistant") || block.classList.contains("msg-thought")) {
			enhanceRenderedMarkdown(content, { renderMermaid });
		}
	}
	pendingMarkdownBlocks.clear();
	scrollToBottom();
}

function scheduleMarkdownRender(block, getTextFn) {
	pendingMarkdownBlocks.set(block, getTextFn);
	if (markdownRenderScheduled) return;
	markdownRenderScheduled = true;
	markdownRenderTimer = setTimeout(flushMarkdownRender, MARKDOWN_RENDER_DELAY_MS);
}

function ensureThoughtBlock() {
	if (app.chat.thoughtBlock) return app.chat.thoughtBlock;
	app.chat.thoughtBlock = addSystemMessage("thought", "Thinking", "");
	app.chat.thoughtText = "";
	return app.chat.thoughtBlock;
}

export function appendThoughtChunk(text) {
	const block = ensureThoughtBlock();
	app.chat.thoughtText += text;
	scheduleMarkdownRender(block, () => app.chat.thoughtText);
}

export function finalizeThoughtBlock() {
	flushMarkdownRender({ renderMermaid: true });
	app.chat.thoughtBlock = null;
	app.chat.thoughtText = "";
}

function ensureAssistantBlock() {
	if (app.chat.assistantBlock) return app.chat.assistantBlock;
	finalizeThoughtBlock();
	app.chat.assistantBlock = addSystemMessage("assistant", "", "");
	app.chat.assistantText = "";
	return app.chat.assistantBlock;
}

export function appendAssistantChunk(text) {
	const block = ensureAssistantBlock();
	app.chat.assistantText += text;
	scheduleMarkdownRender(block, () => app.chat.assistantText);
}

export function finalizeAssistantTurn() {
	flushMarkdownRender({ renderMermaid: true });
	finalizeThoughtBlock();
	app.chat.assistantBlock = null;
	app.chat.assistantText = "";
}
