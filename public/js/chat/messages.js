import { app } from "../state/store.js";
import { $, messagesEl, inputEl, chatInputEl } from "../dom/elements.js";
import { animateEnter } from "../utils/animation.js";
import { escapeHtml } from "../utils/format.js";
import { enhanceAssistantCodeBlocks, renderMarkdown } from "../utils/markdown.js";
import { resetContextUsage } from "../context/dial.js";
import { clearChangedFiles, resetPlanPanel } from "./tools.js";
import { clearPendingUserMessage } from "./history.js";

export function getActiveInput() {
	return app.currentView === "chat" ? chatInputEl : inputEl;
}

export function scrollToBottom() {
	if (app.batchHistoryMode) return;
	const area = $("chat-area");
	if (area) area.scrollTop = area.scrollHeight;
}

export function clearChat() {
	messagesEl.replaceChildren();
	app.toolCards.clear();
	clearPendingUserMessage();
	finalizeAssistantTurn();
	resetPlanPanel();
	clearChangedFiles();
	resetContextUsage();
}

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
	animateEnter(article, "anim-fade-up");
	scrollToBottom();
}

function streamingMessageAnchor() {
	return app.assistantBlock;
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
	if (kind === "assistant") enhanceAssistantCodeBlocks(article.querySelector(".msg-content"));
	appendChatNode(article);
	animateEnter(article, "anim-fade-up");
	return article;
}

const MARKDOWN_RENDER_DELAY_MS = 75;

let markdownRenderScheduled = false;
let markdownRenderTimer = null;
const pendingMarkdownBlocks = new Map();

export function flushMarkdownRender() {
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
		if (block.classList.contains("msg-assistant")) enhanceAssistantCodeBlocks(content);
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
	if (app.thoughtBlock) return app.thoughtBlock;
	app.thoughtBlock = addSystemMessage("thought", "Thinking", "");
	app.thoughtText = "";
	return app.thoughtBlock;
}

export function appendThoughtChunk(text) {
	const block = ensureThoughtBlock();
	app.thoughtText += text;
	scheduleMarkdownRender(block, () => app.thoughtText);
}

export function finalizeThoughtBlock() {
	flushMarkdownRender();
	app.thoughtBlock = null;
	app.thoughtText = "";
}

function ensureAssistantBlock() {
	if (app.assistantBlock) return app.assistantBlock;
	finalizeThoughtBlock();
	app.assistantBlock = addSystemMessage("assistant", "", "");
	app.assistantText = "";
	return app.assistantBlock;
}

export function appendAssistantChunk(text) {
	const block = ensureAssistantBlock();
	app.assistantText += text;
	scheduleMarkdownRender(block, () => app.assistantText);
}

export function finalizeAssistantTurn() {
	flushMarkdownRender();
	finalizeThoughtBlock();
	app.assistantBlock = null;
	app.assistantText = "";
}
