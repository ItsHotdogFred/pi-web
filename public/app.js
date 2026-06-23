/* pi-web — Cursor-style dashboard */

const $ = (id) => document.getElementById(id);

const todayListEl = $("today-list");
const activityFeedEl = $("activity-feed");
const dashboardViewEl = $("dashboard-view");
const chatViewEl = $("chat-view");
const messagesEl = $("messages");
const statusEl = $("status");
const chatStatusEl = $("chat-status");
const projectNameEl = $("project-name");
const branchNameEl = $("branch-name");
const chatTitleEl = $("chat-title");
const composerEl = $("composer");
const inputEl = $("input");
const sendEl = $("send");
const chatComposerEl = $("chat-composer");
const chatInputEl = $("chat-input");
const chatSendEl = $("chat-send");
const cancelEl = $("cancel");
const sidebarEl = $("sidebar");
const sidebarToggleEl = $("sidebar-toggle");
const searchBtnEl = $("search-btn");
const sidebarSearchEl = $("sidebar-search");
const searchInputEl = $("search-input");
const commandsOverlayEl = $("commands-overlay");
const commandsInputEl = $("commands-input");
const commandsListEl = $("commands-list");
const commandsHintEl = $("commands-hint");
const fileInputEl = $("file-input");
const attachBtnEl = $("attach-btn");
const modelLabelEl = $("model-label");

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

const MODELS = ["Composer 2.5", "Composer 2.5 Fast", "GPT-5.4", "Claude 4.6 Sonnet"];
const MCPS = ["All MCPs", "Filesystem", "Git", "Browser"];
const BRANCH_COLORS = ["branch-green", "branch-purple", "branch-orange"];
const CARD_VARIANTS = ["open", "merged", "running", "code"];

const COMMANDS = [
	{ name: "Explain codebase", desc: "Understand project structure and key files", prompt: "Explain this codebase — structure, key files, and how things fit together." },
	{ name: "Fix a bug", desc: "Track down and resolve issues", prompt: "Find and fix a bug in this project. Start by asking me what's broken or scan for likely issues." },
	{ name: "Add a feature", desc: "Build something new following existing patterns", prompt: "Help me add a new feature. Ask what I want to build, then implement it following existing patterns." },
	{ name: "Write tests", desc: "Improve test coverage", prompt: "Write tests for the most important parts of this codebase." },
	{ name: "Start dev server", desc: "Run the development server", prompt: "Start the dev server in tmux and confirm it's running." },
	{ name: "Review changes", desc: "Review uncommitted or recent changes", prompt: "Review my recent changes and suggest improvements." },
];

let ws = null;
let busy = false;
let lastError = "";
let cwd = "";
let sessionId = null;
let sessions = [];
let searchQuery = "";
let currentView = "dashboard";
let selectedModel = MODELS[0];
let gitInfo = { branch: "master", branches: ["master"], project: "pi-web" };

let assistantBlock = null;
let assistantText = "";
const toolCards = new Map();
let connectionState = "connecting";
let gotReady = false;
let startupBuffer = "";
let startupSuppressed = false;

/* ── Utilities ── */

function basename(path) {
	if (!path) return "pi-web";
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts[parts.length - 1] || path;
}

function hashCode(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function pseudoStats(sessionId) {
	const h = hashCode(sessionId || "default");
	return {
		files: 4 + (h % 20),
		additions: 100 + (h % 1200),
		deletions: 20 + (h % 200),
		variant: CARD_VARIANTS[h % CARD_VARIANTS.length],
		branchColor: BRANCH_COLORS[h % BRANCH_COLORS.length],
	};
}

function formatRelativeTime(iso) {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const diff = Date.now() - then;
	const sec = Math.floor(diff / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d`;
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderMarkdown(text) {
	if (window.marked?.parse) {
		return window.marked.parse(text, { breaks: true });
	}
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll("\n", "<br>");
}

function formatRaw(value) {
	if (value == null || value === "") return "";
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

const FRIENDLY_TOOL_NAMES = { ffgrep: "grep", fffind: "find", bash: "shell" };

function isToolCallId(name) {
	return typeof name === "string" && /^tool_[0-9a-f-]{8,}$/i.test(name.trim());
}

function stripToolPrefix(name) {
	if (!name) return "";
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
	for (const candidate of [data.title, data.toolName, parseNameFromRaw(data.rawOutput), parseNameFromRaw(data.rawInput)]) {
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
	return String(status ?? "running").toLowerCase().replace(/\s+/g, "_");
}

function statusLabel(status) {
	return normalizeStatus(status).replace(/_/g, " ");
}

function scrollToBottom() {
	const area = $("chat-area");
	if (area) area.scrollTop = area.scrollHeight;
}

function sortedSessions() {
	return [...sessions].sort(
		(a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
	);
}

function filteredSessions() {
	const q = searchQuery.trim().toLowerCase();
	if (!q) return sortedSessions();
	return sortedSessions().filter((s) => (s.title || "New Agent").toLowerCase().includes(q));
}

function sessionTitle(session) {
	return session.title || "New Agent";
}

/* ── Views ── */

function showView(view) {
	currentView = view;
	dashboardViewEl.classList.toggle("hidden", view !== "dashboard");
	chatViewEl.classList.toggle("hidden", view !== "chat");
	document.querySelectorAll(".nav-item").forEach((el) => {
		el.classList.toggle("active", el.dataset.view === view || (view === "chat" && el.dataset.view === "new-agent"));
	});
	sidebarEl.classList.remove("open");
}

function setNavActive(view) {
	document.querySelectorAll(".nav-item").forEach((el) => {
		el.classList.toggle("active", el.dataset.view === view);
	});
}

/* ── Status & controls ── */

function setStatus(state, detail = "") {
	for (const el of [statusEl, chatStatusEl]) {
		el.className = `connection-status status-${state}`;
		const labelEl = el.querySelector(".status-label");
		const labels = {
			connecting: "Connecting…",
			loading_history: "Loading…",
			ready: "Connected",
			busy: "Working…",
			error: detail || "Error",
		};
		labelEl.textContent = labels[state] ?? state;
	}
	if (state === "error" && detail) lastError = detail;
}

function setProjectName(path) {
	cwd = path || "";
	const name = basename(path);
	projectNameEl.textContent = name;
	gitInfo.project = name;
}

function setBusy(nextBusy) {
	busy = nextBusy;
	const connected = ws && ws.readyState === WebSocket.OPEN;
	sendEl.disabled = !connected || busy;
	chatSendEl.disabled = !connected || busy;
	cancelEl.disabled = !busy;
	inputEl.disabled = !connected;
	chatInputEl.disabled = !connected;
	sendEl.classList.toggle("hidden", !inputEl.value.trim());
}

function resizeTextarea(el) {
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
}

/* ── Dropdowns ── */

function closeAllDropdowns() {
	document.querySelectorAll(".dropdown-menu").forEach((menu) => menu.classList.add("hidden"));
}

function setupDropdown(triggerId, menuId, items, onSelect) {
	const trigger = $(triggerId);
	const menu = $(menuId);
	if (!trigger || !menu) return;

	trigger.addEventListener("click", (e) => {
		e.stopPropagation();
		const wasOpen = !menu.classList.contains("hidden");
		closeAllDropdowns();
		if (!wasOpen) {
			menu.classList.remove("hidden");
		}
	});

	menu.addEventListener("click", (e) => e.stopPropagation());
}

function renderDropdownMenu(menuId, items, selected, onSelect) {
	const menu = $(menuId);
	menu.replaceChildren();
	for (const item of items) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "dropdown-item" + (item === selected ? " selected" : "");
		btn.textContent = item;
		btn.addEventListener("click", () => {
			onSelect(item);
			closeAllDropdowns();
		});
		menu.appendChild(btn);
	}
}

function initDropdowns() {
	renderDropdownMenu("model-menu", MODELS, selectedModel, (model) => {
		selectedModel = model;
		modelLabelEl.textContent = model;
		renderDropdownMenu("model-menu", MODELS, selectedModel, () => {});
	});

	renderDropdownMenu("mcps-menu", MCPS, MCPS[0], () => {});

	setupDropdown("model-trigger", "model-menu");
	setupDropdown("mcps-trigger", "mcps-menu");
	setupDropdown("project-trigger", "project-menu");
	setupDropdown("branch-trigger", "branch-menu");

	document.addEventListener("click", closeAllDropdowns);
}

function updateGitDropdowns() {
	renderDropdownMenu("branch-menu", gitInfo.branches, gitInfo.branch, (branch) => {
		gitInfo.branch = branch;
		branchNameEl.textContent = branch;
	});

	const projects = [gitInfo.project];
	renderDropdownMenu("project-menu", projects, gitInfo.project, () => {});
	branchNameEl.textContent = gitInfo.branch;
}

async function fetchGitInfo() {
	try {
		const res = await fetch("/api/git");
		if (res.ok) {
			gitInfo = await res.json();
			projectNameEl.textContent = gitInfo.project || basename(cwd);
			updateGitDropdowns();
		}
	} catch {
		updateGitDropdowns();
	}
}

/* ── Today sidebar & activity feed ── */

function branchIconSvg(colorClass) {
	return `<svg class="today-item-icon ${colorClass}" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
		<circle cx="4" cy="4" r="2" stroke="currentColor" stroke-width="1.1"/>
		<circle cx="10" cy="10" r="2" stroke="currentColor" stroke-width="1.1"/>
		<path d="M4 6v2.5a1.5 1.5 0 001.5 1.5H8" stroke="currentColor" stroke-width="1.1"/>
	</svg>`;
}

function runningIconSvg() {
	return `<svg class="today-item-icon running" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
		<circle cx="7" cy="7" r="5.25" stroke="currentColor" stroke-width="1.1"/>
	</svg>`;
}

function renderTodayList() {
	const list = filteredSessions();
	todayListEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("p");
		empty.className = "today-empty";
		empty.textContent = searchQuery ? "No matches" : "No agents yet";
		todayListEl.appendChild(empty);
		return;
	}

	for (const session of list) {
		const stats = pseudoStats(session.sessionId);
		const isActive = session.sessionId === sessionId;
		const isRunning = isActive && busy;

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "today-item" + (isActive ? " active" : "");
		btn.dataset.sessionId = session.sessionId;

		const icon = isRunning ? runningIconSvg() : branchIconSvg(stats.branchColor);
		const meta = isRunning
			? `${sessionTitle(session).slice(0, 20)}… ${formatRelativeTime(session.updatedAt)}`
			: `+${stats.additions} -${stats.deletions}`;

		btn.innerHTML = `${icon}<span class="today-item-body"><span class="today-item-title">${sessionTitle(session)}</span><span class="today-item-meta">${meta}</span></span>`;

		btn.addEventListener("click", () => openSession(session.sessionId));
		todayListEl.appendChild(btn);
	}
}

function renderActivityCardLeft(session, stats, isRunning) {
	const left = document.createElement("div");
	left.className = "activity-card-left";

	if (isRunning || stats.variant === "code") {
		left.classList.add("code-preview");
		left.innerHTML = `
			<div class="code-line"><span class="code-prompt">$</span> Start dev server in tmux</div>
			<div class="code-line">npm install</div>
		`;
		return left;
	}

	const files = document.createElement("span");
	files.className = "activity-card-files";
	files.textContent = `${stats.files} files`;

	const diff = document.createElement("span");
	diff.className = "activity-card-diff";
	diff.innerHTML = `<span class="diff-add">+${stats.additions}</span><span class="diff-del">-${stats.deletions}</span>`;

	const statsRow = document.createElement("div");
	statsRow.className = "activity-card-stats";
	statsRow.append(files, diff);

	const badge = document.createElement("span");
	badge.className = `activity-badge ${stats.variant}`;
	const badgeLabels = { open: "Open", merged: "Merged", running: "Running" };
	badge.textContent = badgeLabels[stats.variant] || "Open";

	if (stats.variant === "open" || stats.variant === "merged") {
		badge.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="3" cy="5" r="1.5" stroke="currentColor"/><circle cx="7" cy="5" r="1.5" stroke="currentColor"/><path d="M3 5.5h1.5a1 1 0 001-1H7" stroke="currentColor"/></svg> ${badgeLabels[stats.variant]}`;
	}

	left.append(statsRow, badge);
	return left;
}

function renderActivityFeed() {
	const list = filteredSessions();
	activityFeedEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("div");
		empty.className = "activity-empty";
		empty.textContent = searchQuery ? "No matching agents" : "No recent activity — start a new agent above";
		activityFeedEl.appendChild(empty);
		return;
	}

	for (const session of list) {
		const stats = pseudoStats(session.sessionId);
		const isActive = session.sessionId === sessionId;
		const isRunning = isActive && busy;

		const card = document.createElement("button");
		card.type = "button";
		card.className = "activity-card" + (isActive ? " selected" : "");
		card.dataset.sessionId = session.sessionId;

		const left = renderActivityCardLeft(session, stats, isRunning);

		const right = document.createElement("div");
		right.className = "activity-card-right";

		const title = document.createElement("span");
		title.className = "activity-card-title";
		title.textContent = sessionTitle(session);

		const subtitle = document.createElement("span");
		subtitle.className = "activity-card-subtitle";
		subtitle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="3" cy="6" r="1.5" stroke="currentColor"/><circle cx="9" cy="6" r="1.5" stroke="currentColor"/><path d="M3 6.5h1.5a1 1 0 001-1H9" stroke="currentColor"/></svg> ${selectedModel.split(" ")[0].toLowerCase()}-${selectedModel.includes("Fast") ? "fast" : "high"} ${gitInfo.project} ${formatRelativeTime(session.updatedAt)}`;

		right.append(title, subtitle);
		card.append(left, right);

		card.addEventListener("click", () => openSession(session.sessionId));
		activityFeedEl.appendChild(card);
	}
}

function renderSessions() {
	renderTodayList();
	renderActivityFeed();
	const active = sessions.find((s) => s.sessionId === sessionId);
	if (active) chatTitleEl.textContent = sessionTitle(active);
}

function upsertSession(entry) {
	const idx = sessions.findIndex((s) => s.sessionId === entry.sessionId);
	if (idx >= 0) sessions[idx] = { ...sessions[idx], ...entry };
	else sessions.push(entry);
	renderSessions();
}

function openSession(id) {
	if (id === sessionId && currentView === "chat") return;
	switchSession(id);
	showView("chat");
}

function switchSession(id) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "switch_session", sessionId: id }));
}

function newSession() {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "new_session" }));
}

/* ── Chat messages ── */

function clearChat() {
	messagesEl.replaceChildren();
	toolCards.clear();
	finalizeAssistantTurn();
}

function addUserMessage(text) {
	const article = document.createElement("article");
	article.className = "msg msg-user";
	article.innerHTML = `<div class="msg-content">${renderMarkdown(text)}</div>`;
	messagesEl.appendChild(article);
	scrollToBottom();
}

function addSystemMessage(kind, label, html) {
	const article = document.createElement("article");
	article.className = `msg msg-${kind}`;
	const labelHtml = label ? `<span class="msg-label">${label}</span>` : "";
	article.innerHTML = `${labelHtml}<div class="msg-content">${html}</div>`;
	messagesEl.appendChild(article);
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
			<div class="tool-section tool-input-section"><div class="tool-section-label">Input</div><pre class="tool-input"></pre></div>
			<div class="tool-section tool-output-section"><div class="tool-section-label">Output</div><pre class="tool-output"></pre></div>
		</div>`;

	card.querySelector(".tool-header").addEventListener("click", () => {
		const expanded = card.classList.toggle("expanded");
		card.querySelector(".tool-header").setAttribute("aria-expanded", String(expanded));
	});

	messagesEl.appendChild(card);
	scrollToBottom();

	const state = { el: card, title: null, toolName: null, rawInput: null, rawOutput: null, status: "running" };
	toolCards.set(id, state);
	return state;
}

function updateToolCard(msg) {
	const id = msg.id;
	if (!id) return;

	let state = toolCards.get(id);
	if (!state) state = createToolCard(id);

	if (msg.title) state.title = msg.title;
	if (msg.toolName) state.toolName = msg.toolName;
	if (msg.rawInput != null) state.rawInput = msg.rawInput;
	if (msg.rawOutput != null) state.rawOutput = msg.rawOutput;
	if (msg.status != null) state.status = msg.status;

	const card = state.el;
	card.querySelector(".tool-name").textContent = resolveToolName(state);

	const statusBadge = card.querySelector(".tool-status");
	const norm = normalizeStatus(state.status);
	statusBadge.className = `tool-status tool-status-${norm}`;
	statusBadge.textContent = statusLabel(state.status);

	for (const [key, prop] of [["tool-input", state.rawInput], ["tool-output", state.rawOutput]]) {
		const pre = card.querySelector(`.${key}`);
		const section = pre.closest(".tool-section");
		const text = formatRaw(prop);
		if (text) {
			pre.textContent = text;
			section.style.display = "";
		} else {
			section.style.display = "none";
		}
	}

	scrollToBottom();
}

/* ── Commands palette ── */

function openCommands() {
	commandsOverlayEl.classList.remove("hidden");
	commandsInputEl.value = "";
	renderCommandsList("");
	commandsInputEl.focus();
}

function closeCommands() {
	commandsOverlayEl.classList.add("hidden");
}

function renderCommandsList(filter) {
	const q = filter.trim().toLowerCase();
	const matches = COMMANDS.filter(
		(c) => !q || c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q),
	);
	commandsListEl.replaceChildren();

	for (const cmd of matches) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.innerHTML = `<span class="command-name">${cmd.name}</span><span class="command-desc">${cmd.desc}</span>`;
		btn.addEventListener("click", () => {
			closeCommands();
			inputEl.value = cmd.prompt;
			inputEl.dispatchEvent(new Event("input"));
			inputEl.focus();
		});
		li.appendChild(btn);
		commandsListEl.appendChild(li);
	}
}

/* ── WebSocket ── */

function connect() {
	lastError = "";
	gotReady = false;
	setStatus("connecting");
	ws = new WebSocket(wsUrl);

	ws.addEventListener("open", () => setBusy(false));

	ws.addEventListener("close", () => {
		setStatus("error", gotReady ? "Disconnected" : lastError || "Disconnected");
		setBusy(false);
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
					renderSessions();
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
				if (!shouldSkipStartupContent(chunkText)) appendAssistantChunk(chunkText);
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
				addSystemMessage("system", "Permission", `Auto-approved: <strong>${msg.tool ?? "tool"}</strong>`);
				break;

			case "plan":
				addSystemMessage("system", "Plan", renderMarkdown("```json\n" + JSON.stringify(msg.entries ?? [], null, 2) + "\n```"));
				break;

			case "done":
				finalizeAssistantTurn();
				setStatus("ready");
				setBusy(false);
				renderSessions();
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

/* ── Send prompt ── */

function sendPrompt(text, fromChat = false) {
	const trimmed = text.trim();
	if (!trimmed || !ws || ws.readyState !== WebSocket.OPEN || busy) return;

	showView("chat");
	addUserMessage(trimmed);

	if (fromChat) {
		chatInputEl.value = "";
		resizeTextarea(chatInputEl);
	} else {
		inputEl.value = "";
		resizeTextarea(inputEl);
		sendEl.classList.add("hidden");
	}

	ws.send(JSON.stringify({ type: "prompt", text: trimmed }));
}

/* ── Event listeners ── */

composerEl.addEventListener("submit", (e) => {
	e.preventDefault();
	sendPrompt(inputEl.value);
});

chatComposerEl.addEventListener("submit", (e) => {
	e.preventDefault();
	sendPrompt(chatInputEl.value, true);
});

cancelEl.addEventListener("click", () => {
	if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "cancel" }));
});

inputEl.addEventListener("keydown", (e) => {
	if (e.key === "/" && !inputEl.value) {
		e.preventDefault();
		openCommands();
		return;
	}
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		composerEl.requestSubmit();
	}
});

inputEl.addEventListener("input", () => {
	resizeTextarea(inputEl);
	sendEl.classList.toggle("hidden", !inputEl.value.trim());
	setBusy(busy);
});

chatInputEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		chatComposerEl.requestSubmit();
	}
});

chatInputEl.addEventListener("input", () => resizeTextarea(chatInputEl));

$("nav-new-agent").addEventListener("click", () => {
	setNavActive("new-agent");
	showView("dashboard");
	inputEl.focus();
});

$("nav-dashboard").addEventListener("click", () => {
	setNavActive("dashboard");
	showView("dashboard");
});

$("back-to-dashboard").addEventListener("click", () => {
	showView("dashboard");
	setNavActive("new-agent");
});

sidebarToggleEl.addEventListener("click", () => sidebarEl.classList.toggle("open"));

searchBtnEl.addEventListener("click", () => {
	sidebarSearchEl.classList.toggle("hidden");
	if (!sidebarSearchEl.classList.contains("hidden")) searchInputEl.focus();
});

searchInputEl.addEventListener("input", () => {
	searchQuery = searchInputEl.value;
	renderSessions();
});

commandsHintEl.addEventListener("click", openCommands);

commandsInputEl.addEventListener("input", () => renderCommandsList(commandsInputEl.value));

commandsOverlayEl.addEventListener("click", (e) => {
	if (e.target === commandsOverlayEl) closeCommands();
});

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeCommands();
	if (e.key === "/" && currentView === "dashboard" && document.activeElement !== inputEl) {
		e.preventDefault();
		openCommands();
	}
});

attachBtnEl.addEventListener("click", () => fileInputEl.click());

fileInputEl.addEventListener("change", () => {
	const file = fileInputEl.files?.[0];
	if (file) {
		const prefix = `[Attached image: ${file.name}]\n`;
		inputEl.value = prefix + inputEl.value;
		inputEl.dispatchEvent(new Event("input"));
		inputEl.focus();
	}
	fileInputEl.value = "";
});

document.addEventListener("click", (e) => {
	if (
		window.innerWidth <= 768 &&
		sidebarEl.classList.contains("open") &&
		!sidebarEl.contains(e.target) &&
		e.target !== sidebarToggleEl &&
		!sidebarToggleEl.contains(e.target)
	) {
		sidebarEl.classList.remove("open");
	}
});

/* ── Init ── */

initDropdowns();
fetchGitInfo();
connect();
showView("dashboard");
