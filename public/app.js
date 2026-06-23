/* pi-web client — pi-agent-style UI */

const sessionListEl = document.getElementById("session-list");
const welcomeEl = document.getElementById("welcome");
const messagesEl = document.getElementById("messages");
const statusEl = document.getElementById("status");
const projectNameEl = document.getElementById("project-name");
const formEl = document.getElementById("composer");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const cancelEl = document.getElementById("cancel");
const newChatEl = document.getElementById("new-chat");
const sidebarEl = document.getElementById("sidebar");
const sidebarToggleEl = document.getElementById("sidebar-toggle");
const attachmentsEl = document.getElementById("attachments");
const imageInputEl = document.getElementById("image-input");
const attachImageEl = document.getElementById("attach-image");
const welcomeStartEl = document.getElementById("welcome-start");

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

let ws = null;
let busy = false;
let lastError = "";
let cwd = "";
let sessionId = null;
let sessions = [];
let pendingAttachments = [];

let assistantBlock = null;
let assistantText = "";
const toolCards = new Map();
let connectionState = "connecting";
let gotReady = false;
let startupBuffer = "";
let startupSuppressed = false;

/* ── Utilities ── */

function basename(path) {
	if (!path) return "—";
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts[parts.length - 1] || path;
}

function formatRelativeTime(iso) {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const diff = Date.now() - then;
	const sec = Math.floor(diff / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d ago`;
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(text) {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function colorizeDiffText(text) {
	return text.split("\n").map((line) => {
		const escaped = escapeHtml(line);
		if (line.startsWith("+") && !line.startsWith("+++")) {
			return `<span class="diff-line-add">${escaped}</span>`;
		}
		if (line.startsWith("-") && !line.startsWith("---")) {
			return `<span class="diff-line-remove">${escaped}</span>`;
		}
		return escaped;
	}).join("\n");
}

function enhanceDiffBlocks(root) {
	if (!root) return;
	root.querySelectorAll("pre").forEach((pre) => {
		if (pre.dataset.diffEnhanced === "1") return;
		const text = pre.textContent ?? "";
		if (!/^[-+]/m.test(text)) return;
		pre.innerHTML = colorizeDiffText(text);
		pre.classList.add("diff-block");
		pre.dataset.diffEnhanced = "1";
	});
}

function renderMarkdown(text) {
	let html;
	if (window.marked?.parse) {
		html = window.marked.parse(text, { breaks: true });
	} else {
		html = text
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll("\n", "<br>");
	}
	const container = document.createElement("div");
	container.innerHTML = html;
	enhanceDiffBlocks(container);
	return container.innerHTML;
}

function formatRaw(value) {
	if (value == null || value === "") return "";
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			return JSON.stringify(parsed, null, 2);
		} catch {
			return value;
		}
	}
	if (typeof value === "object") {
		return JSON.stringify(value, null, 2);
	}
	return String(value);
}

const FRIENDLY_TOOL_NAMES = {
	ffgrep: "grep",
	fffind: "find",
	bash: "shell",
};

function isToolCallId(name) {
	if (!name || typeof name !== "string") return false;
	return /^tool_[0-9a-f-]{8,}$/i.test(name.trim());
}

function stripToolPrefix(name) {
	if (!name || typeof name !== "string") return "";
	let s = name.trim();
	if (s.startsWith("mcp_pi_")) return s.slice(7);
	if (s.startsWith("mcp_")) return s.slice(4);
	return s;
}

function parseNameFromRaw(raw) {
	if (raw == null || raw === "") return null;
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (parsed && typeof parsed === "object") {
			return parsed.toolName || parsed.name || parsed.title || parsed.tool || null;
		}
	} catch {
		/* plain text */
	}
	return null;
}

function normalizeToolName(name) {
	if (!name || typeof name !== "string") return null;
	const stripped = stripToolPrefix(name);
	if (!stripped || isToolCallId(stripped) || isToolCallId(name)) return null;
	return FRIENDLY_TOOL_NAMES[stripped] || stripped;
}

function resolveToolName(data) {
	const candidates = [
		data.title,
		data.toolName,
		parseNameFromRaw(data.rawOutput),
		parseNameFromRaw(data.rawInput),
	];
	for (const candidate of candidates) {
		const name = normalizeToolName(candidate);
		if (name) return name;
	}
	return "Tool";
}

function isPiStartupDump(text) {
	return text.includes("## Skills") && text.includes("## Extensions");
}

function shouldSkipStartupContent(text) {
	if (connectionState !== "connecting") return false;
	if (startupSuppressed) return true;
	startupBuffer += text;
	if (isPiStartupDump(startupBuffer)) {
		startupSuppressed = true;
		return true;
	}
	return false;
}

function normalizeStatus(status) {
	return String(status ?? "running")
		.toLowerCase()
		.replace(/\s+/g, "_");
}

function statusLabel(status) {
	const s = normalizeStatus(status);
	return s.replace(/_/g, " ");
}

function scrollToBottom() {
	const area = document.getElementById("chat-area");
	if (area) area.scrollTop = area.scrollHeight;
}

function updateWelcomeVisibility() {
	const hasMessages = messagesEl.children.length > 0;
	welcomeEl.classList.toggle("hidden", hasMessages);
	document.body.classList.toggle("has-messages", hasMessages);
	const chatArea = document.getElementById("chat-area");
	if (chatArea) chatArea.classList.toggle("has-messages", hasMessages);
	updateComposerVisibility();
}

function updateComposerVisibility() {
	const hasMessages = messagesEl.children.length > 0;
	const showComposer = hasMessages || formEl.classList.contains("visible");
	formEl.classList.toggle("visible", showComposer);
}

function showComposer() {
	formEl.classList.add("visible");
	inputEl.focus();
}

/* ── Status & controls ── */

function setStatus(state, detail = "") {
	statusEl.className = `connection-status status-${state}`;
	const labelEl = statusEl.querySelector(".status-label");
	const labels = {
		connecting: "Connecting…",
		loading_history: "Loading history…",
		ready: "Connected",
		busy: "Working…",
		error: detail || "Error",
	};
	labelEl.textContent = labels[state] ?? state;
	if (state === "error" && detail) lastError = detail;
}

function setProjectName(path) {
	cwd = path || "";
	const name = basename(path);
	projectNameEl.textContent = name;
	projectNameEl.title = path || "";
}

function setBusy(nextBusy) {
	busy = nextBusy;
	const connected = ws && ws.readyState === WebSocket.OPEN;
	const canSend = connected && !busy && (inputEl.value.trim() || pendingAttachments.length > 0);
	sendEl.disabled = !canSend;
	cancelEl.disabled = !busy;
	inputEl.disabled = !connected;
	attachImageEl.disabled = !connected;
}

function resizeTextarea() {
	inputEl.style.height = "auto";
	inputEl.style.height = `${Math.min(inputEl.scrollHeight, window.innerHeight * 0.4)}px`;
}

/* ── Sessions sidebar ── */

function renderSessions() {
	sessionListEl.replaceChildren();
	if (sessions.length === 0) {
		const empty = document.createElement("p");
		empty.className = "session-empty";
		empty.textContent = "No chats yet";
		sessionListEl.appendChild(empty);
		return;
	}
	const sorted = [...sessions].sort(
		(a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
	);

	for (const session of sorted) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "session-item";
		if (session.sessionId === sessionId) btn.classList.add("active");
		btn.dataset.sessionId = session.sessionId;

		const title = document.createElement("span");
		title.className = "session-item-title";
		title.textContent = session.title || "New chat";

		const time = document.createElement("span");
		time.className = "session-item-time";
		time.textContent = formatRelativeTime(session.updatedAt);

		btn.append(title, time);
		btn.addEventListener("click", () => {
			if (session.sessionId !== sessionId) {
				switchSession(session.sessionId);
			}
			sidebarEl.classList.remove("open");
		});
		sessionListEl.appendChild(btn);
	}
}

function upsertSession(entry) {
	const idx = sessions.findIndex((s) => s.sessionId === entry.sessionId);
	if (idx >= 0) {
		sessions[idx] = { ...sessions[idx], ...entry };
	} else {
		sessions.push(entry);
	}
	renderSessions();
}

function switchSession(id) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "switch_session", sessionId: id }));
}

function newSession() {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "new_session" }));
	sidebarEl.classList.remove("open");
}

/* ── Chat messages ── */

function clearChat() {
	messagesEl.replaceChildren();
	toolCards.clear();
	pendingAttachments = [];
	renderAttachmentPreviews();
	formEl.classList.remove("visible");
	inputEl.value = "";
	resizeTextarea();
	finalizeAssistantTurn();
	updateWelcomeVisibility();
}

function addUserMessage(text, attachments = []) {
	const article = document.createElement("article");
	article.className = "msg msg-user";
	let html = "";
	for (const attachment of attachments) {
		html += `<img class="msg-image" src="${attachment.dataUrl}" alt="${escapeHtml(attachment.name)}">`;
	}
	if (text) html += renderMarkdown(text);
	article.innerHTML = `<div class="msg-content">${html}</div>`;
	messagesEl.appendChild(article);
	updateWelcomeVisibility();
	scrollToBottom();
}

function addSystemMessage(kind, label, html) {
	const article = document.createElement("article");
	article.className = `msg msg-${kind}`;
	const labelHtml = label ? `<span class="msg-label">${label}</span>` : "";
	article.innerHTML = `${labelHtml}<div class="msg-content">${html}</div>`;
	messagesEl.appendChild(article);
	updateWelcomeVisibility();
	scrollToBottom();
	return article;
}

function ensureAssistantBlock() {
	if (assistantBlock) return assistantBlock;
	assistantBlock = addSystemMessage("assistant", "", "");
	assistantText = "";
	return assistantBlock;
}

function appendAssistantChunk(text) {
	const block = ensureAssistantBlock();
	assistantText += text;
	block.querySelector(".msg-content").innerHTML = renderMarkdown(assistantText);
	scrollToBottom();
}

function finalizeAssistantTurn() {
	assistantBlock = null;
	assistantText = "";
}

/* ── Tool cards ── */

function createToolCard(id) {
	const card = document.createElement("article");
	card.className = "tool-card";
	card.dataset.toolId = id;

	card.innerHTML = `
		<button type="button" class="tool-header" aria-expanded="false">
			<span class="tool-chevron" aria-hidden="true">▶</span>
			<span class="tool-name"></span>
			<span class="tool-status"></span>
		</button>
		<div class="tool-body">
			<div class="tool-section tool-input-section">
				<div class="tool-section-label">Input</div>
				<pre class="tool-input"></pre>
			</div>
			<div class="tool-section tool-output-section">
				<div class="tool-section-label">Output</div>
				<pre class="tool-output"></pre>
			</div>
		</div>
	`;

	const header = card.querySelector(".tool-header");
	header.addEventListener("click", () => {
		const expanded = card.classList.toggle("expanded");
		header.setAttribute("aria-expanded", String(expanded));
	});

	messagesEl.appendChild(card);
	updateWelcomeVisibility();
	scrollToBottom();

	const state = {
		el: card,
		title: null,
		toolName: null,
		rawInput: null,
		rawOutput: null,
		status: "running",
	};

	toolCards.set(id, state);
	return state;
}

function updateToolCard(msg) {
	const id = msg.id;
	if (!id) return;

	let state = toolCards.get(id);
	if (!state) {
		state = createToolCard(id);
	}

	if (msg.event === "start") {
		if (msg.title) state.title = msg.title;
		if (msg.toolName) state.toolName = msg.toolName;
		if (msg.rawInput != null) state.rawInput = msg.rawInput;
		if (msg.rawOutput != null) state.rawOutput = msg.rawOutput;
	} else {
		if (msg.title) state.title = msg.title;
		if (msg.toolName) state.toolName = msg.toolName;
		if (msg.rawInput != null) state.rawInput = msg.rawInput;
		if (msg.rawOutput != null) state.rawOutput = msg.rawOutput;
	}

	if (msg.status != null) state.status = msg.status;

	const card = state.el;
	card.querySelector(".tool-name").textContent = resolveToolName(state);

	const statusEl = card.querySelector(".tool-status");
	const norm = normalizeStatus(state.status);
	statusEl.className = `tool-status tool-status-${norm}`;
	statusEl.textContent = statusLabel(state.status);

	const inputPre = card.querySelector(".tool-input");
	const outputPre = card.querySelector(".tool-output");
	const inputSection = card.querySelector(".tool-input-section");
	const outputSection = card.querySelector(".tool-output-section");

	const inputText = formatRaw(state.rawInput);
	const outputText = formatRaw(state.rawOutput);

	if (inputText) {
		inputPre.innerHTML = colorizeDiffText(inputText);
		inputPre.style.display = "";
		inputSection.querySelector(".tool-section-label").style.display = "";
	} else {
		inputPre.textContent = "";
		inputPre.style.display = "none";
		inputSection.querySelector(".tool-section-label").style.display = "none";
	}

	if (outputText) {
		outputPre.innerHTML = colorizeDiffText(outputText);
		outputPre.style.display = "";
		outputSection.querySelector(".tool-section-label").style.display = "";
	} else {
		outputPre.textContent = "";
		outputPre.style.display = "none";
		outputSection.querySelector(".tool-section-label").style.display = "none";
	}

	scrollToBottom();
}

/* ── WebSocket ── */

function connect() {
	lastError = "";
	gotReady = false;
	setStatus("connecting");
	ws = new WebSocket(wsUrl);

	ws.addEventListener("open", () => {
		setBusy(false);
	});

	ws.addEventListener("close", () => {
		if (!gotReady) {
			setStatus("error", lastError || "Disconnected");
		} else {
			setStatus("error", "Disconnected");
		}
		setBusy(false);
		sendEl.disabled = true;
		cancelEl.disabled = true;
		inputEl.disabled = true;
	});

	ws.addEventListener("error", () => {
		if (!gotReady) lastError = "Connection failed";
	});

	ws.addEventListener("message", (event) => {
		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}

		switch (msg.type) {
			case "sessions":
				sessions = Array.isArray(msg.sessions) ? msg.sessions : [];
				renderSessions();
				break;

			case "session":
				sessionId = msg.sessionId ?? null;
				renderSessions();
				break;

			case "clear":
				clearChat();
				break;

			case "status":
				if (msg.cwd) setProjectName(msg.cwd);
				if (msg.state === "ready") {
					gotReady = true;
					connectionState = "ready";
					startupBuffer = "";
					startupSuppressed = false;
					setStatus("ready");
					setBusy(false);
					if (msg.sessionId) {
						sessionId = msg.sessionId;
						renderSessions();
					}
				} else if (msg.state === "busy") {
					setStatus("busy");
					setBusy(true);
				} else if (msg.state === "loading_history") {
					setStatus("loading_history");
				} else if (msg.state === "connecting") {
					connectionState = "connecting";
					startupBuffer = "";
					startupSuppressed = false;
					setStatus("connecting");
					if (msg.cwd) setProjectName(msg.cwd);
				} else if (msg.state === "error") {
					setStatus("error", msg.message ?? "Error");
				}
				break;

			case "user":
			case "user_chunk":
				finalizeAssistantTurn();
				addUserMessage(msg.text ?? "");
				break;

			case "chunk": {
				const chunkText = msg.text ?? "";
				if (!shouldSkipStartupContent(chunkText)) {
					appendAssistantChunk(chunkText);
				}
				break;
			}

			case "thought": {
				const thoughtText = msg.text ?? "";
				if (!shouldSkipStartupContent(thoughtText)) {
					addSystemMessage("thought", "Thinking", renderMarkdown(thoughtText));
				}
				break;
			}

			case "tool":
				updateToolCard(msg);
				break;

			case "permission":
				addSystemMessage(
					"system",
					"Permission",
					`Auto-approved: <strong>${msg.tool ?? "tool"}</strong> (${msg.choice ?? "allow"})`,
				);
				break;

			case "plan":
				addSystemMessage("system", "Plan", renderMarkdown("```json\n" + JSON.stringify(msg.entries ?? [], null, 2) + "\n```"));
				break;

			case "done":
				finalizeAssistantTurn();
				setStatus("ready");
				setBusy(false);
				break;

			case "error":
				addSystemMessage("error", "Error", msg.message ?? "Unknown error");
				setBusy(false);
				setStatus("ready");
				break;

			default:
				break;
		}
	});
}

/* ── Image attachments ── */

function renderAttachmentPreviews() {
	attachmentsEl.replaceChildren();
	for (const [index, attachment] of pendingAttachments.entries()) {
		const wrap = document.createElement("div");
		wrap.className = "attachment-preview";

		const img = document.createElement("img");
		img.src = attachment.dataUrl;
		img.alt = attachment.name;

		const removeBtn = document.createElement("button");
		removeBtn.type = "button";
		removeBtn.className = "attachment-remove";
		removeBtn.setAttribute("aria-label", `Remove ${attachment.name}`);
		removeBtn.textContent = "×";
		removeBtn.addEventListener("click", () => {
			pendingAttachments.splice(index, 1);
			renderAttachmentPreviews();
			setBusy(busy);
		});

		wrap.append(img, removeBtn);
		attachmentsEl.appendChild(wrap);
	}
	setBusy(busy);
}

function addImageAttachment(file) {
	if (!file || !file.type.startsWith("image/")) return;
	const reader = new FileReader();
	reader.onload = () => {
		pendingAttachments.push({
			name: file.name || "image",
			dataUrl: reader.result,
			type: file.type,
		});
		renderAttachmentPreviews();
		showComposer();
	};
	reader.readAsDataURL(file);
}

function buildPromptText(text, attachments) {
	const trimmed = text.trim();
	if (!attachments.length) return trimmed;
	const imageMarkdown = attachments
		.map((attachment) => `![${attachment.name}](${attachment.dataUrl})`)
		.join("\n");
	if (!trimmed) return imageMarkdown;
	return `${trimmed}\n\n${imageMarkdown}`;
}

/* ── Send prompt ── */

function sendPrompt(text) {
	const trimmed = text.trim();
	if ((!trimmed && pendingAttachments.length === 0) || !ws || ws.readyState !== WebSocket.OPEN || busy) return;

	const attachments = [...pendingAttachments];
	addUserMessage(trimmed, attachments);
	inputEl.value = "";
	pendingAttachments = [];
	renderAttachmentPreviews();
	resizeTextarea();
	ws.send(JSON.stringify({ type: "prompt", text: buildPromptText(trimmed, attachments) }));
}

formEl.addEventListener("submit", (event) => {
	event.preventDefault();
	sendPrompt(inputEl.value);
});

cancelEl.addEventListener("click", () => {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "cancel" }));
});

inputEl.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		formEl.requestSubmit();
	}
});

inputEl.addEventListener("input", () => {
	resizeTextarea();
	setBusy(busy);
});

attachImageEl.addEventListener("click", () => {
	imageInputEl.click();
});

imageInputEl.addEventListener("change", () => {
	for (const file of imageInputEl.files ?? []) {
		addImageAttachment(file);
	}
	imageInputEl.value = "";
});

inputEl.addEventListener("paste", (event) => {
	const items = event.clipboardData?.items;
	if (!items) return;
	let hasImage = false;
	for (const item of items) {
		if (item.type.startsWith("image/")) {
			hasImage = true;
			const file = item.getAsFile();
			if (file) addImageAttachment(file);
		}
	}
	if (hasImage) event.preventDefault();
});

welcomeStartEl?.addEventListener("click", () => {
	showComposer();
});

newChatEl.addEventListener("click", newSession);

sidebarToggleEl.addEventListener("click", () => {
	sidebarEl.classList.toggle("open");
});

document.querySelectorAll(".quick-action").forEach((btn) => {
	btn.addEventListener("click", () => {
		const prompt = btn.dataset.prompt;
		if (prompt) {
			showComposer();
			sendPrompt(prompt);
		}
	});
});

document.addEventListener("click", (event) => {
	if (
		window.innerWidth <= 768 &&
		sidebarEl.classList.contains("open") &&
		!sidebarEl.contains(event.target) &&
		event.target !== sidebarToggleEl &&
		!sidebarToggleEl.contains(event.target)
	) {
		sidebarEl.classList.remove("open");
	}
});

connect();
resizeTextarea();
