import { chatAreaEl, messagesEl, promptHistoryListEl } from "../dom/elements.js";
import { truncateText, escapeHtml } from "../utils/format.js";
import { app } from "../state/store.js";
import { openSession, upsertSession } from "../dashboard/sessions.js";
import { setStatus } from "../ui/status.js";

let promptCounter = 0;
let activePromptId = null;
let scrollSpyObserver = null;
let forkInFlight = false;

function promptPreview(text, hasImages) {
	const trimmed = (text ?? "").trim();
	if (trimmed) return truncateText(trimmed.replace(/\s+/g, " "), 72);
	if (hasImages) return "Image attachment";
	return "Empty prompt";
}

function createHistoryItem(promptId, index, label) {
	const item = document.createElement("div");
	item.className = "prompt-history-item";
	item.dataset.promptId = promptId;
	item.dataset.promptIndex = String(index);

	const button = document.createElement("button");
	button.type = "button";
	button.className = "prompt-history-main";
	button.title = label;
	button.innerHTML = `<span class="prompt-history-index">${index}</span><span class="prompt-history-text">${escapeHtml(label)}</span>`;

	const forkBtn = document.createElement("button");
	forkBtn.type = "button";
	forkBtn.className = "prompt-history-fork";
	forkBtn.title = "Fork from here";
	forkBtn.setAttribute("aria-label", `Fork from prompt ${index}`);
	forkBtn.innerHTML =
		'<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><circle cx="4" cy="6" r="2" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="6" r="2" stroke="currentColor" stroke-width="1.1"/><path d="M6 6h0" stroke="currentColor" stroke-width="1.1"/></svg>';

	item.append(button, forkBtn);
	if (promptId === activePromptId) item.classList.add("active");
	return item;
}

function setActivePrompt(promptId) {
	activePromptId = promptId;
	if (!promptHistoryListEl) return;
	for (const item of promptHistoryListEl.querySelectorAll(".prompt-history-item")) {
		item.classList.toggle("active", item.dataset.promptId === promptId);
	}
}

function ensurePromptId(article) {
	if (article.dataset.promptId) return article.dataset.promptId;
	promptCounter += 1;
	const promptId = `prompt-${promptCounter}`;
	article.dataset.promptId = promptId;
	return promptId;
}

function getUserMessages() {
	return [...messagesEl.querySelectorAll(".msg-user")];
}

function observeUserMessages(articles) {
	if (!scrollSpyObserver) return;
	for (const article of articles) scrollSpyObserver.observe(article);
}

function renderEmptyState() {
	if (!promptHistoryListEl) return;
	promptHistoryListEl.replaceChildren();
	const empty = document.createElement("p");
	empty.className = "prompt-history-empty";
	empty.textContent = "No prompts yet";
	promptHistoryListEl.appendChild(empty);
}

async function forkFromPrompt(promptIndex) {
	if (forkInFlight || app.ui.busy) return;

	const sourceSessionId = app.session.sessionId;
	const cwd = app.session.cwd;
	if (!sourceSessionId || !cwd) {
		setStatus("error", "No active session to fork");
		return;
	}

	forkInFlight = true;
	try {
		const response = await fetch("/api/session/fork", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd, sourceSessionId, promptIndex }),
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(data.message || "Fork failed");
		}

		upsertSession({
			sessionId: data.sessionId,
			title: data.title ?? null,
			cwd,
			updatedAt: new Date().toISOString(),
		});
		openSession(data.sessionId);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus("error", message);
	} finally {
		forkInFlight = false;
	}
}

export function clearPromptHistory() {
	promptCounter = 0;
	activePromptId = null;
	renderEmptyState();
}

export function rebuildPromptHistory() {
	if (!promptHistoryListEl) return;

	const userMessages = getUserMessages();
	promptCounter = userMessages.length;
	activePromptId = null;

	if (userMessages.length === 0) {
		renderEmptyState();
		return;
	}

	const fragment = document.createDocumentFragment();
	userMessages.forEach((article, index) => {
		const promptId = ensurePromptId(article);
		const text = article.dataset.promptText ?? article.querySelector(".msg-content")?.textContent ?? "";
		const hasImages = article.querySelector(".msg-images") != null;
		article.dataset.promptText = text.trim();
		fragment.appendChild(createHistoryItem(promptId, index + 1, promptPreview(text, hasImages)));
	});

	promptHistoryListEl.replaceChildren(fragment);
	observeUserMessages(userMessages);
}

export function registerUserPrompt(article, text, { hasImages = false } = {}) {
	if (!promptHistoryListEl) return;

	const empty = promptHistoryListEl.querySelector(".prompt-history-empty");
	if (empty) empty.remove();

	const promptId = ensurePromptId(article);
	article.dataset.promptText = (text ?? "").trim();

	const index = getUserMessages().length;
	promptHistoryListEl.appendChild(
		createHistoryItem(promptId, index, promptPreview(text, hasImages || article.querySelector(".msg-images") != null)),
	);
	observeUserMessages([article]);
}

export function jumpToPrompt(promptId) {
	const message = messagesEl.querySelector(`.msg-user[data-prompt-id="${promptId}"]`);
	if (!message || !chatAreaEl) return;

	setActivePrompt(promptId);
	message.classList.add("msg-user--highlight");
	message.scrollIntoView({ behavior: "smooth", block: "start" });
	window.setTimeout(() => message.classList.remove("msg-user--highlight"), 1200);
}

function setupScrollSpy() {
	if (!chatAreaEl || scrollSpyObserver) return;

	scrollSpyObserver = new IntersectionObserver(
		(entries) => {
			const visible = entries
				.filter((entry) => entry.isIntersecting)
				.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
			const promptId = visible[0]?.target?.dataset?.promptId;
			if (promptId) setActivePrompt(promptId);
		},
		{
			root: chatAreaEl,
			rootMargin: "-20% 0px -55% 0px",
			threshold: [0, 0.25, 0.5, 0.75, 1],
		},
	);

	observeUserMessages(getUserMessages());
}

export function initPromptHistory() {
	if (!promptHistoryListEl) return;

	renderEmptyState();

	promptHistoryListEl.addEventListener("click", (event) => {
		const forkBtn = event.target.closest(".prompt-history-fork");
		if (forkBtn) {
			event.preventDefault();
			event.stopPropagation();
			const item = forkBtn.closest(".prompt-history-item");
			const promptIndex = Number(item?.dataset.promptIndex);
			if (promptIndex > 0) void forkFromPrompt(promptIndex);
			return;
		}

		const item = event.target.closest(".prompt-history-item");
		if (!item?.dataset.promptId) return;
		jumpToPrompt(item.dataset.promptId);
	});

	setupScrollSpy();
}
