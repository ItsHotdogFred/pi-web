/* pi-web — browser dashboard for Pi */

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
const cancelEl = $("cancel");
const fileContextEl = $("file-context");
const sidebarEl = $("sidebar");
const searchBtnEl = $("search-btn");
const sidebarSearchEl = $("sidebar-search");
const searchInputEl = $("search-input");
const commandsHintEl = $("commands-hint");
const inlineCommandsEl = $("inline-commands");
const inlineCommandsListEl = $("inline-commands-list");
const chatInlineCommandsEl = $("chat-inline-commands");
const chatInlineCommandsListEl = $("chat-inline-commands-list");
const fileInputEl = $("file-input");
const attachBtnEl = $("attach-btn");
const modelLabelEl = $("model-label");

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const RECENT_PROJECTS_KEY = "pi-web-recent-projects";
const ACTIVITY_ART_KEY = "pi-web-activity-art-style";

let ws = null;
let busy = false;
let lastError = "";
let cwd = "";
let sessionId = null;
let sessions = [];
let searchQuery = "";
let currentView = "dashboard";
let models = [];
let currentModelId = null;
let pendingModelSelection = null;
let modelSearchQuery = "";
let modelSearchTimer = null;
let activeModelScope = "dashboard";
let commands = [];
let gitInfo = { branch: "master", branches: ["master"], project: "pi-web" };
let pendingProjectPath = null;
let lastPrompt = "";
let fileContextCollapsed = false;
let viewTransitioning = false;
let animateActivityFeed = false;

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateEnter(el, className = "anim-fade-up", { delay = 0 } = {}) {
	if (!el || batchHistoryMode || prefersReducedMotion()) return;
	if (delay > 0) el.style.animationDelay = `${delay}ms`;
	el.classList.add(className);
	el.addEventListener(
		"animationend",
		() => {
			el.classList.remove(className);
			el.style.animationDelay = "";
		},
		{ once: true },
	);
}

const CONTEXT_DIAL_CIRCUMFERENCE = 43.982;
let contextUsage = { used: null, size: null, percent: null, breakdown: [] };
let contextPopoverTimer = null;
let contextCompactPending = false;

const contextDialWrapEl = $("context-dial-wrap");
const contextDialTriggerEl = $("context-dial-trigger");
const contextPopoverEl = $("context-popover");
const contextBreakdownEl = $("context-breakdown");
const contextPopoverSummaryEl = $("context-popover-summary");
const contextActionsEl = $("context-actions");
const contextCompactBtnEl = $("context-compact-btn");
const contextNewSessionBtnEl = $("context-new-session-btn");

const permissionModalEl = $("permission-modal");
const permissionDialogEl = $("permission-dialog");
const permissionTitleEl = $("permission-title");
const permissionDetailsEl = $("permission-details");
const permissionActionsEl = $("permission-actions");

let permissionQueue = [];
let activePermissionRequest = null;
let permissionPreviousFocus = null;

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

	activePermissionRequest = request;
	permissionPreviousFocus = document.activeElement;

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
	activePermissionRequest = null;
	if (permissionPreviousFocus?.focus) {
		permissionPreviousFocus.focus();
	}
	permissionPreviousFocus = null;
}

function processPermissionQueue() {
	if (activePermissionRequest || permissionQueue.length === 0) return;
	showPermissionModal(permissionQueue.shift());
}

function enqueuePermissionRequest(msg) {
	permissionQueue.push(msg);
	processPermissionQueue();
}

function respondToPermission(requestId, optionId) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "permission_response", requestId, optionId }));
	hidePermissionModal();
	processPermissionQueue();
}

function cancelActivePermissionRequest() {
	if (!activePermissionRequest) return;
	if (ws?.readyState === WebSocket.OPEN) {
		ws.send(
			JSON.stringify({
				type: "permission_response",
				requestId: activePermissionRequest.requestId,
				cancelled: true,
			}),
		);
	}
	hidePermissionModal();
	processPermissionQueue();
}

function clearPermissionRequests() {
	permissionQueue = [];
	if (activePermissionRequest) {
		hidePermissionModal();
	}
}

function formatPermissionResult(msg) {
	const tool = permissionToolName(typeof msg.tool === "object" ? msg.tool : { title: msg.tool });
	const choice = String(msg.choice ?? "").toLowerCase();
	const kind = String(msg.optionId ?? "").toLowerCase();
	if (choice.includes("deny") || choice.includes("reject") || kind.includes("reject")) {
		return `Denied <strong>${tool}</strong>`;
	}
	return `Allowed <strong>${tool}</strong>`;
}

function initPermissionModal() {
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

function formatTokenCount(value) {
	if (value == null || Number.isNaN(value)) return "—";
	const n = Math.max(0, Math.round(value));
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (n >= 10_000) return `${Math.round(n / 1000)}k`;
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return String(n);
}

function formatBreakdownTokenCount(value) {
	if (value == null || Number.isNaN(value)) return "—";
	return Math.max(0, Math.round(value)).toLocaleString();
}

function contextDialLevel(percent) {
	if (percent == null) return "unknown";
	if (percent > 90) return "high";
	if (percent > 70) return "medium";
	return "low";
}

function renderContextBreakdown(breakdown, windowSize) {
	if (!contextBreakdownEl) return;
	contextBreakdownEl.replaceChildren();

	const items = Array.isArray(breakdown) ? breakdown : [];
	if (items.length === 0) {
		const empty = document.createElement("li");
		empty.className = "context-breakdown-empty";
		empty.textContent = "No breakdown available yet";
		contextBreakdownEl.appendChild(empty);
		return;
	}

	const basis =
		windowSize && windowSize > 0
			? windowSize
			: items.reduce((sum, item) => sum + (item.tokens ?? 0), 0);

	for (const item of items) {
		const li = document.createElement("li");
		li.className = "context-breakdown-item";

		const label = document.createElement("span");
		label.className = "context-breakdown-label";
		label.textContent = item.label ?? item.id ?? "Other";
		if (item.source) label.title = item.source;

		const bar = document.createElement("span");
		bar.className = "context-breakdown-bar";
		const fill = document.createElement("span");
		const pct = basis > 0 ? Math.min(100, ((item.tokens ?? 0) / basis) * 100) : 0;
		fill.style.width = `${pct}%`;
		bar.appendChild(fill);

		const value = document.createElement("span");
		value.className = "context-breakdown-value";
		value.textContent = formatBreakdownTokenCount(item.tokens);

		li.append(label, bar, value);
		contextBreakdownEl.appendChild(li);
	}
}

function setContextPopoverOpen(open) {
	if (!contextDialWrapEl || !contextPopoverEl || !contextDialTriggerEl) return;
	contextDialWrapEl.classList.toggle("is-open", open);
	contextPopoverEl.classList.toggle("hidden", !open);
	contextDialTriggerEl.setAttribute("aria-expanded", String(open));
}

function renderContextUsage() {
	if (!contextDialWrapEl) return;

	const { used, size, percent, breakdown } = contextUsage;
	const show = Boolean(sessionId && currentView === "chat");
	contextDialWrapEl.classList.toggle("hidden", !show);
	if (!show) {
		setContextPopoverOpen(false);
		return;
	}

	const level = contextDialLevel(percent);
	contextDialWrapEl.classList.remove("context-dial--low", "context-dial--medium", "context-dial--high", "context-dial--unknown");
	contextDialWrapEl.classList.add(`context-dial--${level}`);

	const fill = contextDialWrapEl.querySelector(".context-dial-fill");
	if (fill) {
		const pct = percent == null ? 0 : Math.min(Math.max(percent, 0), 100);
		fill.style.strokeDashoffset = String(CONTEXT_DIAL_CIRCUMFERENCE * (1 - pct / 100));
	}

	const labelEl = $("context-dial-label");
	if (labelEl) labelEl.textContent = percent == null ? "—" : `${percent.toFixed(0)}%`;

	if (contextPopoverSummaryEl) {
		const usedLabel = used == null ? "?" : formatTokenCount(used);
		const sizeLabel = size == null ? "?" : formatTokenCount(size);
		contextPopoverSummaryEl.textContent = `${usedLabel} / ${sizeLabel}`;
	}

	renderContextBreakdown(breakdown, size);

	if (contextActionsEl) {
		const showActions =
			Boolean(sessionId) && currentView === "chat" && percent != null && percent >= 70;
		contextActionsEl.classList.toggle("hidden", !showActions);
		contextActionsEl.classList.toggle("context-actions--high", level === "high");
	}

	if (contextCompactBtnEl) {
		const compacting = contextCompactPending && busy;
		contextCompactBtnEl.disabled = busy || creatingSession || contextCompactPending;
		contextCompactBtnEl.textContent = compacting ? "Compacting…" : "Compact now";
	}

	if (contextNewSessionBtnEl) {
		contextNewSessionBtnEl.disabled = busy || creatingSession;
	}
}

function setContextUsage(next) {
	contextUsage = {
		used: next?.used ?? null,
		size: next?.size ?? null,
		percent: next?.percent ?? null,
		breakdown: Array.isArray(next?.breakdown) ? next.breakdown : [],
	};
	renderContextUsage();
}

function resetContextUsage() {
	setContextUsage({ used: null, size: null, percent: null, breakdown: [] });
}

function initContextDialPopover() {
	if (!contextDialWrapEl || !contextPopoverEl) return;

	const openPopover = () => {
		clearTimeout(contextPopoverTimer);
		setContextPopoverOpen(true);
	};

	const closePopover = () => {
		clearTimeout(contextPopoverTimer);
		contextPopoverTimer = setTimeout(() => setContextPopoverOpen(false), 120);
	};

	contextDialWrapEl.addEventListener("mouseenter", openPopover);
	contextDialWrapEl.addEventListener("mouseleave", closePopover);
	contextDialWrapEl.addEventListener("focusin", openPopover);
	contextDialWrapEl.addEventListener("focusout", (event) => {
		if (!contextDialWrapEl.contains(event.relatedTarget)) closePopover();
	});

	contextCompactBtnEl?.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!ws || ws.readyState !== WebSocket.OPEN || busy || creatingSession || contextCompactPending) return;
		contextCompactPending = true;
		renderContextUsage();
		setStatus("busy");
		ws.send(JSON.stringify({ type: "compact" }));
	});

	contextNewSessionBtnEl?.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!ws || ws.readyState !== WebSocket.OPEN || busy || creatingSession) return;
		const percent = contextUsage.percent ?? 0;
		if (percent < 90) {
			const ok = confirm("Start a fresh session? Your current conversation will remain in history.");
			if (!ok) return;
		}
		newSession();
	});
}

function loadActivityArtStyle() {
	const styles = window.SessionArt?.styles ?? ["aurora", "identicon", "flow"];
	try {
		const stored = localStorage.getItem(ACTIVITY_ART_KEY);
		if (stored && styles.includes(stored)) return stored;
	} catch {
		/* ignore */
	}
	return styles[0];
}

let activityArtStyle = loadActivityArtStyle();
let artStyleToastTimer = null;

const changedFiles = new Set();

const LANG_TAGS = {
	js: "JS",
	ts: "TS",
	tsx: "TS",
	jsx: "JS",
	py: "PY",
	css: "CSS",
	html: "HTML",
	json: "JSON",
	md: "MD",
};

const MODEL_SCOPES = {
	dashboard: {
		searchId: "model-search",
		listId: "model-menu-list",
		menuId: "model-menu",
		dropdownId: "model-dropdown",
		labelId: "model-label",
		triggerId: "model-trigger",
	},
	chat: {
		searchId: "chat-model-search",
		listId: "chat-model-menu-list",
		menuId: "chat-model-menu",
		dropdownId: "chat-model-dropdown",
		labelId: "chat-model-label",
		triggerId: "chat-model-trigger",
	},
};

let attachTarget = inputEl;
const dashboardAttachments = [];
const chatAttachments = [];

let assistantBlock = null;
let assistantText = "";
let thoughtBlock = null;
let thoughtText = "";
const toolCards = new Map();
let connectionState = "connecting";
let gotReady = false;
let startupBuffer = "";
let startupSuppressed = false;
let creatingSession = false;
let awaitingNewAgentSession = false;
let freshDashboardSession = false;
let pendingDashboardPrompt = null;
let loadingHistory = false;
let batchHistoryMode = false;
let pendingUserMessage = null;

/* ── Utilities ── */

function getActiveInput() {
	return currentView === "chat" ? chatInputEl : inputEl;
}

function clearPendingUserMessage() {
	pendingUserMessage = null;
}

function flushUserMessage() {
	if (!pendingUserMessage) return;
	const { text, images } = pendingUserMessage;
	if (text || images.length) {
		finalizeAssistantTurn();
		addUserMessage(text, images);
	}
	clearPendingUserMessage();
}

function appendUserChunk(msg) {
	const messageId = msg.messageId ?? null;

	if (pendingUserMessage && messageId && pendingUserMessage.messageId !== messageId) {
		flushUserMessage();
	}

	if (!pendingUserMessage) {
		pendingUserMessage = { messageId, text: "", images: [] };
	}

	if (msg.text) pendingUserMessage.text += msg.text;
	if (msg.image?.data && msg.image?.mimeType) {
		pendingUserMessage.images.push({
			mimeType: msg.image.mimeType,
			data: msg.image.data,
		});
	}
}

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

function sessionAccentColor(sessionId) {
	const seed = hashCode(sessionId || "default");
	return SessionArt?.accentColor(activityArtStyle, seed) ?? "var(--muted)";
}

function applySessionArt(left, sessionId) {
	if (!window.SessionArt) return;

	const seed = hashCode(sessionId || "default");
	const art = document.createElement("div");
	art.className = "activity-card-art";

	const result = SessionArt.render(activityArtStyle, seed);
	if (result.type === "css") {
		art.style.background = result.background;
	} else if (result.type === "svg") {
		art.innerHTML = result.html;
	} else if (result.type === "canvas") {
		art.appendChild(result.element);
	}

	const scrim = document.createElement("div");
	scrim.className = "activity-card-scrim";
	left.append(art, scrim);
	left.classList.add(`activity-card-left--${activityArtStyle}`);
}

function showArtStyleToast(style) {
	let toast = document.getElementById("art-style-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "art-style-toast";
		toast.className = "art-style-toast";
		document.body.appendChild(toast);
	}

	const label = SessionArt?.labels?.[style] ?? style;
	toast.textContent = `Activity art: ${label} · Ctrl+Shift+G to cycle`;
	toast.classList.add("visible");
	clearTimeout(artStyleToastTimer);
	artStyleToastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
}

function cycleActivityArtStyle() {
	const styles = SessionArt?.styles ?? ["aurora", "identicon", "flow"];
	const idx = styles.indexOf(activityArtStyle);
	activityArtStyle = styles[(idx + 1) % styles.length];
	try {
		localStorage.setItem(ACTIVITY_ART_KEY, activityArtStyle);
	} catch {
		/* ignore */
	}
	renderSessions();
	showArtStyleToast(activityArtStyle);
}

function sessionProjectName(session) {
	return basename(session.cwd || cwd || gitInfo.project);
}

function sessionStatus(session, { isActive, isRunning }) {
	if (isRunning) return { variant: "running", label: "Running" };
	if (isActive) return { variant: "active", label: "Active" };
	return { variant: "saved", label: "Saved" };
}

function sessionBadgeIcon(variant) {
	switch (variant) {
		case "running":
			return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="5" r="1.25" fill="currentColor"/></svg>`;
		case "active":
			return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="2.25" fill="currentColor"/></svg>`;
		default:
			return `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><circle cx="5" cy="5" r="3.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 3v2.5l1.5 1" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
	}
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

function isGenericToolName(name) {
	return typeof name === "string" && name.trim().toLowerCase() === "tool";
}

function mergeToolName(current, incoming) {
	if (!incoming) return current;
	if (!isGenericToolName(incoming)) return incoming;
	if (current && !isGenericToolName(current)) return current;
	return incoming;
}

function resolveToolName(data) {
	for (const candidate of [
		data.title,
		data.toolName,
		parseNameFromRaw(data.rawOutput),
		parseNameFromRaw(data.rawInput),
		data.kind,
	]) {
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
	if (batchHistoryMode) return;
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

function currentModelLabel() {
	const match = models.find((model) => model.id === currentModelId);
	return match?.name || "Model";
}

function syncModelLabels() {
	const label = currentModelLabel();
	if (modelLabelEl) modelLabelEl.textContent = label;
	const chatLabel = $("chat-model-label");
	if (chatLabel) chatLabel.textContent = label;
}

/* ── Views ── */

function showView(view, { animate = true } = {}) {
	const prevView = currentView;
	if (view === prevView && !viewTransitioning) {
		document.querySelectorAll(".nav-item").forEach((el) => {
			el.classList.toggle("active", el.dataset.view === view);
		});
		sidebarEl.classList.remove("open");
		renderContextUsage();
		return;
	}

	currentView = view;
	if (view === "dashboard") animateActivityFeed = animate;

	document.querySelectorAll(".nav-item").forEach((el) => {
		el.classList.toggle("active", el.dataset.view === view);
	});
	sidebarEl.classList.remove("open");

	const fromEl = prevView === "dashboard" ? dashboardViewEl : chatViewEl;
	const toEl = view === "dashboard" ? dashboardViewEl : chatViewEl;

	if (!animate || prefersReducedMotion()) {
		dashboardViewEl.classList.toggle("hidden", view !== "dashboard");
		chatViewEl.classList.toggle("hidden", view !== "chat");
		if (view === "dashboard") renderActivityFeed();
		renderContextUsage();
		return;
	}

	viewTransitioning = true;
	fromEl.classList.add("view-leaving");

	fromEl.addEventListener(
		"animationend",
		() => {
			fromEl.classList.remove("view-leaving");
			fromEl.classList.add("hidden");

			toEl.classList.remove("hidden");
			toEl.classList.add("view-entering");

			toEl.addEventListener(
				"animationend",
				() => {
					toEl.classList.remove("view-entering");
					viewTransitioning = false;
					if (view === "dashboard") renderActivityFeed();
				},
				{ once: true },
			);
		},
		{ once: true },
	);

	renderContextUsage();
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
	gitInfo.project = basename(path);
	gitInfo.path = path || gitInfo.path;
	syncGitContext();
}

function loadRecentProjects() {
	try {
		const stored = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || "[]");
		return Array.isArray(stored) ? stored.filter((entry) => typeof entry === "string" && entry.trim()) : [];
	} catch {
		return [];
	}
}

function rememberProject(path) {
	if (!path) return;
	const recent = loadRecentProjects().filter((entry) => entry !== path);
	recent.unshift(path);
	localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent.slice(0, 8)));
}

function renderProjectMenu() {
	const list = $("project-menu-list");
	const pathInput = $("project-path-input");
	if (!list) return;

	list.replaceChildren();
	clearProjectPathError();
	const recent = loadRecentProjects();
	const current = cwd || gitInfo.path;

	if (pathInput && current) {
		pathInput.placeholder = current;
	}

	if (recent.length === 0) {
		const empty = document.createElement("p");
		empty.className = "project-menu-empty";
		empty.textContent = "No recent projects";
		list.appendChild(empty);
		return;
	}

	for (const path of recent) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "dropdown-item project-menu-item" + (path === current ? " selected" : "");
		btn.innerHTML = `<span class="project-menu-name">${basename(path)}</span><span class="project-menu-path">${path}</span>`;
		btn.addEventListener("click", () => chooseProject(path));
		list.appendChild(btn);
	}
}

function clearProjectPathError() {
	const errorEl = $("project-path-error");
	if (!errorEl) return;
	errorEl.textContent = "";
	errorEl.classList.add("hidden");
}

function showProjectPathError(message) {
	const errorEl = $("project-path-error");
	if (!errorEl) return;
	errorEl.textContent = message;
	errorEl.classList.remove("hidden");
}

function chooseProject(path) {
	closeAllDropdowns();
	if (!path || path === cwd) return;
	sendProjectPath(path);
}

function sendProjectPath(path) {
	const trimmed = path.trim().replace(/^["']|["']$/g, "");
	if (!trimmed) {
		showProjectPathError("Enter an absolute folder path.");
		return;
	}
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		showProjectPathError("Not connected yet. Wait for Ready, then try again.");
		return;
	}
	if (busy) {
		showProjectPathError("Pi is still working. Wait for it to finish, then try again.");
		return;
	}

	clearProjectPathError();
	closeAllDropdowns();
	pendingProjectPath = trimmed;
	ws.send(JSON.stringify({ type: "set_cwd", path: trimmed }));
}

function reopenProjectMenu() {
	renderProjectMenu();
	$("project-menu")?.classList.remove("hidden");
	$("project-dropdown")?.classList.add("is-open");
}

function resetForProjectSwitch(nextCwd) {
	sessionId = null;
	sessions = [];
	commands = [];
	models = [];
	currentModelId = null;
	pendingModelSelection = null;
	creatingSession = false;
	awaitingNewAgentSession = false;
	freshDashboardSession = false;
	pendingDashboardPrompt = null;
	pendingProjectPath = null;
	clearChat();
	showView("dashboard");
	resetContextUsage();
	if (nextCwd) setProjectName(nextCwd);
	renderSessions();
	renderModelMenu();
}

function setBusy(nextBusy) {
	busy = nextBusy;
	const connected = ws && ws.readyState === WebSocket.OPEN;
	const canSendDashboard = Boolean(inputEl.value.trim() || dashboardAttachments.length);
	sendEl.disabled = !connected || busy || creatingSession || !canSendDashboard;
	cancelEl.disabled = !busy;
	inputEl.disabled = !connected;
	chatInputEl.disabled = !connected;
	sendEl.classList.toggle("hidden", !canSendDashboard);
	cancelEl?.classList.toggle("hidden", !busy);
	renderContextUsage();
}

function getAttachmentsFor(target) {
	return target === chatInputEl ? chatAttachments : dashboardAttachments;
}

function getPreviewContainerFor(target) {
	return target === chatInputEl ? $("chat-attachment-previews") : $("attachment-previews");
}

function renderAttachmentPreviews(target = attachTarget) {
	const attachments = getAttachmentsFor(target);
	const container = getPreviewContainerFor(target);
	if (!container) return;

	container.replaceChildren();
	if (attachments.length === 0) {
		container.classList.add("hidden");
		setBusy(busy);
		return;
	}

	container.classList.remove("hidden");
	for (const attachment of attachments) {
		const chip = document.createElement("div");
		chip.className = "attachment-chip";
		chip.innerHTML = `
			<img src="${attachment.previewUrl}" alt="${attachment.name}" />
			<button type="button" class="attachment-remove" aria-label="Remove image">×</button>`;
		chip.querySelector(".attachment-remove").addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const list = getAttachmentsFor(target);
			const index = list.indexOf(attachment);
			if (index >= 0) list.splice(index, 1);
			renderAttachmentPreviews(target);
		});
		container.appendChild(chip);
	}
	setBusy(busy);
}

function addImageAttachment(file, target = attachTarget) {
	if (!file || !file.type.startsWith("image/")) return;

	const reader = new FileReader();
	reader.onload = () => {
		const previewUrl = reader.result;
		const base64 = String(previewUrl).split(",")[1] ?? "";
		getAttachmentsFor(target).push({
			name: file.name,
			mimeType: file.type || "image/png",
			data: base64,
			previewUrl,
		});
		renderAttachmentPreviews(target);
	};
	reader.readAsDataURL(file);
}

function clearAttachments(target = attachTarget) {
	getAttachmentsFor(target).length = 0;
	renderAttachmentPreviews(target);
}

function resizeTextarea(el) {
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
}

/* ── Dropdowns ── */

function closeAllDropdowns() {
	document.querySelectorAll(".dropdown-menu").forEach((menu) => menu.classList.add("hidden"));
	document.querySelectorAll(".dropdown.is-open").forEach((dropdown) => dropdown.classList.remove("is-open"));
	modelSearchQuery = "";
	for (const scope of Object.values(MODEL_SCOPES)) {
		const search = $(scope.searchId);
		if (search) search.value = "";
	}
}

function initDropdowns() {
	setupModelSearch();
	renderModelMenu();

	$("model-trigger")?.addEventListener("click", (e) => {
		e.stopPropagation();
		openModelDropdown("dashboard");
	});
	$("model-menu")?.addEventListener("click", (e) => e.stopPropagation());

	$("chat-model-trigger")?.addEventListener("click", (e) => {
		e.stopPropagation();
		openModelDropdown("chat");
	});
	$("chat-model-menu")?.addEventListener("click", (e) => e.stopPropagation());

	$("project-trigger")?.addEventListener("click", (e) => {
		e.stopPropagation();
		const menu = $("project-menu");
		const dropdown = $("project-dropdown");
		if (!menu || !dropdown) return;
		const wasOpen = !menu.classList.contains("hidden");
		closeAllDropdowns();
		if (!wasOpen) {
			renderProjectMenu();
			menu.classList.remove("hidden");
			dropdown.classList.add("is-open");
		}
	});
	$("project-menu")?.addEventListener("click", (e) => e.stopPropagation());
	$("project-path-form")?.addEventListener("submit", (e) => {
		e.preventDefault();
		const input = $("project-path-input");
		if (!input) return;
		const path = input.value;
		sendProjectPath(path);
		if (path.trim()) input.value = "";
	});
	$("project-path-input")?.addEventListener("input", clearProjectPathError);

	document.addEventListener("click", closeAllDropdowns);
}

function syncGitContext() {
	const name = gitInfo.project || basename(cwd);
	projectNameEl.textContent = name;
	$("project-trigger")?.setAttribute("title", cwd || gitInfo.path || name);
	branchNameEl.textContent = gitInfo.branch || "master";
}

async function fetchGitInfo(projectPath = cwd) {
	try {
		const query = projectPath ? `?cwd=${encodeURIComponent(projectPath)}` : "";
		const res = await fetch(`/api/git${query}`);
		if (res.ok) {
			gitInfo = await res.json();
			if (gitInfo.path) setProjectName(gitInfo.path);
		}
	} catch {
		// keep defaults
	}
	syncGitContext();
	renderProjectMenu();
}

function openModelDropdown(scope = "dashboard") {
	const config = MODEL_SCOPES[scope];
	if (!config) return;

	const menu = $(config.menuId);
	const dropdown = $(config.dropdownId);
	if (!menu || !dropdown) return;

	const wasOpen = !menu.classList.contains("hidden");
	closeAllDropdowns();
	if (wasOpen) return;

	activeModelScope = scope;
	menu.classList.remove("hidden");
	dropdown.classList.add("is-open");
	modelSearchQuery = "";
	const modelSearch = $(config.searchId);
	if (modelSearch) modelSearch.value = "";
	renderModelMenuList(config.listId);
	requestAnimationFrame(() => modelSearch?.focus());
}

function setupModelSearchForScope(scope) {
	const config = MODEL_SCOPES[scope];
	const modelSearch = $(config.searchId);
	if (!modelSearch || modelSearch.dataset.ready) return;
	modelSearch.dataset.ready = "1";

	modelSearch.addEventListener("input", () => {
		clearTimeout(modelSearchTimer);
		modelSearchTimer = setTimeout(() => {
			activeModelScope = scope;
			modelSearchQuery = modelSearch.value;
			renderModelMenuList(config.listId);
		}, 120);
	});

	modelSearch.addEventListener("click", (e) => e.stopPropagation());
	modelSearch.addEventListener("keydown", (e) => {
		e.stopPropagation();
		if (e.key === "Enter") {
			e.preventDefault();
			const first = filteredModels()[0];
			if (first) selectModel(first.id);
		}
	});
}

function setupModelSearch() {
	for (const scope of Object.keys(MODEL_SCOPES)) {
		setupModelSearchForScope(scope);
	}
}

function filteredModels() {
	const q = modelSearchQuery.trim().toLowerCase();
	if (!q) return models;
	return models.filter(
		(model) =>
			model.name.toLowerCase().includes(q) ||
			model.id.toLowerCase().includes(q) ||
			(model.description && model.description.toLowerCase().includes(q)),
	);
}

function selectModel(modelId) {
	if (!modelId) {
		closeAllDropdowns();
		return;
	}
	if (modelId !== currentModelId) {
		currentModelId = modelId;
		pendingModelSelection = modelId;
		syncModelLabels();
		renderModelMenuList("model-menu-list");
		renderModelMenuList("chat-model-menu-list");
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: "set_model", value: modelId }));
		}
	}
	closeAllDropdowns();
}

function renderModelMenuList(listId = "model-menu-list") {
	const list = $(listId);
	if (!list) return;

	list.replaceChildren();
	const items = filteredModels();

	if (items.length === 0) {
		const empty = document.createElement("div");
		empty.className = "model-menu-empty";
		empty.textContent = models.length ? "No models match your search" : "Waiting for Pi models…";
		list.appendChild(empty);
		return;
	}

	for (const model of items) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "dropdown-item" + (model.id === currentModelId ? " selected" : "");
		btn.innerHTML = `<span class="model-option-name">${model.name}</span>${model.description ? `<span class="model-option-desc">${model.description}</span>` : ""}`;
		btn.addEventListener("click", () => selectModel(model.id));
		list.appendChild(btn);
	}
}

function renderModelMenu() {
	setupModelSearch();
	renderModelMenuList("model-menu-list");
	renderModelMenuList("chat-model-menu-list");
	syncModelLabels();
}

function setModels(payload) {
	if (payload?.current) {
		if (!pendingModelSelection || payload.current === pendingModelSelection) {
			currentModelId = payload.current;
			if (payload.current === pendingModelSelection) pendingModelSelection = null;
		}
	}
	if (Array.isArray(payload?.models)) {
		models = payload.models;
	}
	renderModelMenu();
	if (Array.isArray(payload?.models)) renderSessions();
}

/* ── Today sidebar & activity feed ── */

function sessionIconSvg(color) {
	return `<svg class="today-item-icon" style="color:${color}" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
		<path d="M3 3.5h8a1 1 0 011 1v5a1 1 0 01-1 1H6.5L4 13V9.5H3a1 1 0 01-1-1v-5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
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
		const isActive = session.sessionId === sessionId;
		const isRunning = isActive && busy;
		const status = sessionStatus(session, { isActive, isRunning });

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "today-item" + (isActive ? " active" : "");
		btn.dataset.sessionId = session.sessionId;

		const icon = isRunning ? runningIconSvg() : sessionIconSvg(sessionAccentColor(session.sessionId));
		const meta = isRunning
			? "Working…"
			: formatRelativeTime(session.updatedAt) || sessionProjectName(session);

		btn.innerHTML = `${icon}<span class="today-item-body"><span class="today-item-title">${sessionTitle(session)}</span><span class="today-item-meta">${meta}</span></span>`;

		btn.addEventListener("click", () => openSession(session.sessionId));
		todayListEl.appendChild(btn);
	}
}

function renderActivityCardLeft(session, status, isRunning) {
	const left = document.createElement("div");
	left.className = "activity-card-left";

	if (isRunning) {
		left.classList.add("code-preview");
		const preview = lastPrompt || sessionTitle(session);
		const lines = preview.split("\n").slice(0, 2);
		left.innerHTML = lines
			.map((line) => `<div class="code-line">${line.trim()}</div>`)
			.join("");
		return left;
	}

	applySessionArt(left, session.sessionId);

	const content = document.createElement("div");
	content.className = "activity-card-content";

	const meta = document.createElement("div");
	meta.className = "activity-card-meta";

	const time = document.createElement("span");
	time.className = "activity-card-time";
	time.textContent = formatRelativeTime(session.updatedAt) || "No activity yet";

	const project = document.createElement("span");
	project.className = "activity-card-project";
	project.textContent = sessionProjectName(session);

	meta.append(time, project);

	const badge = document.createElement("span");
	badge.className = `activity-badge ${status.variant}`;
	badge.innerHTML = `${sessionBadgeIcon(status.variant)} ${status.label}`;

	content.append(meta, badge);
	left.append(content);
	return left;
}

function renderActivityFeed() {
	const list = filteredSessions();
	activityFeedEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("div");
		empty.className = "activity-empty";
		empty.textContent = searchQuery ? "No matching agents" : "No recent activity — ask Pi above";
		activityFeedEl.appendChild(empty);
		return;
	}

	for (let i = 0; i < list.length; i++) {
		const session = list[i];
		const isActive = session.sessionId === sessionId;
		const isRunning = isActive && busy;
		const status = sessionStatus(session, { isActive, isRunning });

		const card = document.createElement("button");
		card.type = "button";
		card.className = "activity-card" + (isActive ? " selected" : "");
		card.dataset.sessionId = session.sessionId;

		const left = renderActivityCardLeft(session, status, isRunning);

		const right = document.createElement("div");
		right.className = "activity-card-right";

		const title = document.createElement("span");
		title.className = "activity-card-title";
		title.textContent = sessionTitle(session);

		const subtitle = document.createElement("span");
		subtitle.className = "activity-card-subtitle";
		subtitle.textContent = sessionProjectName(session);

		right.append(title, subtitle);
		card.append(left, right);

		card.addEventListener("click", () => openSession(session.sessionId));
		activityFeedEl.appendChild(card);

		if (animateActivityFeed) {
			animateEnter(card, "anim-fade-up", { delay: i * 40 });
		}
	}

	animateActivityFeed = false;
}

function renderSessions() {
	renderTodayList();
	renderActivityFeed();
	const active = sessions.find((s) => s.sessionId === sessionId);
	if (active) chatTitleEl.textContent = sessionTitle(active);
	else if (sessionId) chatTitleEl.textContent = "New Agent";
}

function upsertSession(entry) {
	const idx = sessions.findIndex((s) => s.sessionId === entry.sessionId);
	if (idx >= 0) {
		const merged = { ...sessions[idx], ...entry };
		if (entry.title == null && sessions[idx].title) merged.title = sessions[idx].title;
		sessions[idx] = merged;
	} else {
		sessions.push(entry);
	}
	renderSessions();
}

function openSession(id) {
	if (id === sessionId && currentView === "chat") return;
	awaitingNewAgentSession = false;
	freshDashboardSession = false;
	pendingDashboardPrompt = null;
	switchSession(id);
	showView("chat");
}

function switchSession(id) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "switch_session", sessionId: id }));
}

function newSession() {
	if (!ws || ws.readyState !== WebSocket.OPEN || creatingSession) return;
	creatingSession = true;
	setBusy(busy);
	ws.send(JSON.stringify({ type: "new_session" }));
}

function clearChangedFiles() {
	changedFiles.clear();
	renderFileContext();
}

function fileLangTag(path) {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	return LANG_TAGS[ext] || ext.toUpperCase().slice(0, 4) || "FILE";
}

function parseToolPayload(raw) {
	if (raw == null) return null;
	if (typeof raw === "object") return raw;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function extractFilePath(payload) {
	if (!payload || typeof payload !== "object") return null;
	return payload.path || payload.file_path || payload.filePath || payload.file || payload.target || null;
}

function trackFileFromTool(state) {
	const toolName = resolveToolName(state).toLowerCase();
	if (!/(write|edit|patch|replace|create|fs)/.test(toolName)) return;

	const payload = parseToolPayload(state.rawInput);
	const path = extractFilePath(payload);
	if (!path) return;

	changedFiles.add(path);
	renderFileContext();
}

function renderFileContext() {
	const countEl = $("file-context-count");
	const listEl = $("file-context-list");
	if (!fileContextEl || !countEl || !listEl) return;

	const files = [...changedFiles].sort((a, b) => a.localeCompare(b));
	const wasHidden = fileContextEl.classList.contains("hidden");
	if (files.length === 0) {
		fileContextEl.classList.add("hidden");
		return;
	}

	fileContextEl.classList.remove("hidden");
	if (wasHidden) animateEnter(fileContextEl, "anim-fade-up");
	fileContextEl.classList.toggle("collapsed", fileContextCollapsed);
	$("file-context-toggle")?.setAttribute("aria-expanded", String(!fileContextCollapsed));
	countEl.textContent = `${files.length} File${files.length === 1 ? "" : "s"} Touched`;

	listEl.replaceChildren();
	for (const path of files) {
		const li = document.createElement("li");
		li.className = "file-context-item";
		li.innerHTML = `
			<span class="file-context-file">
				<span class="file-context-lang">${fileLangTag(path)}</span>
				<span class="file-context-name" title="${path}">${basename(path)}</span>
			</span>`;
		listEl.appendChild(li);
	}
}

function reorderTurnEvents(events) {
	const result = [];
	let turn = [];

	const flushTurn = () => {
		if (!turn.length) return;
		const userEvents = turn.filter((e) => e.type === "user_chunk" || e.type === "user");
		const toolEvents = turn.filter((e) => e.type === "tool");
		const thoughtEvents = turn.filter((e) => e.type === "thought");
		const chunkEvents = turn.filter((e) => e.type === "chunk");
		const planEvents = turn.filter((e) => e.type === "plan");
		const rest = turn.filter(
			(e) => !["user_chunk", "user", "tool", "thought", "chunk", "plan"].includes(e.type),
		);
		result.push(...userEvents, ...thoughtEvents, ...toolEvents, ...chunkEvents, ...planEvents, ...rest);
		turn = [];
	};

	for (const event of events) {
		if (event.type === "user_chunk" || event.type === "user") {
			flushTurn();
			result.push(event);
			continue;
		}
		turn.push(event);
	}
	flushTurn();
	return result;
}

function applyHistoryEvent(event) {
	switch (event.type) {
		case "user_chunk":
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
			addSystemMessage(
				"system",
				"Plan",
				renderMarkdown("\`\`\`json\n" + JSON.stringify(event.entries ?? [], null, 2) + "\n\`\`\`"),
			);
			break;
	}
}

function applyHistoryBatch(events) {
	if (!Array.isArray(events) || events.length === 0) return;
	loadingHistory = true;
	batchHistoryMode = true;
	for (const event of reorderTurnEvents(events)) applyHistoryEvent(event);
	flushUserMessage();
	finalizeAssistantTurn();
	batchHistoryMode = false;
	scrollToBottom();
}

/* ── Chat messages ── */

function clearChat() {
	messagesEl.replaceChildren();
	toolCards.clear();
	clearPendingUserMessage();
	finalizeAssistantTurn();
	clearChangedFiles();
	resetContextUsage();
}

function addUserMessage(text, images = []) {
	const article = document.createElement("article");
	article.className = "msg msg-user";
	const imagesHtml = images.length
		? `<div class="msg-images">${images
				.map(
					(image) =>
						`<img src="${image.previewUrl || `data:${image.mimeType};base64,${image.data}`}" alt="${image.name || "Attached image"}" />`,
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
	return assistantBlock || thoughtBlock;
}

function appendChatNode(node, { beforeStreaming = false } = {}) {
	const anchor = beforeStreaming ? streamingMessageAnchor() : null;
	if (anchor?.isConnected) messagesEl.insertBefore(node, anchor);
	else messagesEl.appendChild(node);
	scrollToBottom();
}

function addSystemMessage(kind, label, html) {
	const article = document.createElement("article");
	article.className = `msg msg-${kind}`;
	const labelHtml = label ? `<span class="msg-label">${label}</span>` : "";
	article.innerHTML = `${labelHtml}<div class="msg-content">${html}</div>`;
	appendChatNode(article);
	animateEnter(article, "anim-fade-up");
	return article;
}

function ensureThoughtBlock() {
	if (thoughtBlock) return thoughtBlock;
	thoughtBlock = addSystemMessage("thought", "Thinking", "");
	thoughtText = "";
	return thoughtBlock;
}

function appendThoughtChunk(text) {
	const block = ensureThoughtBlock();
	thoughtText += text;
	block.querySelector(".msg-content").innerHTML = renderMarkdown(thoughtText);
	scrollToBottom();
}

function finalizeThoughtBlock() {
	thoughtBlock = null;
	thoughtText = "";
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
	finalizeThoughtBlock();
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

	appendChatNode(card, { beforeStreaming: !batchHistoryMode });
	animateEnter(card, "anim-fade-up");

	const state = { el: card, title: null, toolName: null, kind: null, rawInput: null, rawOutput: null, status: "running" };
	toolCards.set(id, state);
	return state;
}

function updateToolCard(msg) {
	const id = msg.id;
	if (!id) return;

	let state = toolCards.get(id);
	if (!state) state = createToolCard(id);

	if (msg.title) state.title = mergeToolName(state.title, msg.title);
	if (msg.toolName) state.toolName = mergeToolName(state.toolName, msg.toolName);
	if (msg.kind) state.kind = msg.kind;
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

	trackFileFromTool(state);
	scrollToBottom();
}

/* ── Commands palette ── */

function filteredCommands(filter) {
	const q = filter.trim().toLowerCase().replace(/^\//, "");
	if (!q) return commands;
	return commands.filter(
		(command) =>
			command.name.toLowerCase().includes(q) ||
			command.description.toLowerCase().includes(q),
	);
}

function applyCommand(command, targetInput = getActiveInput()) {
	const suffix = command.hint ? " " : "";
	targetInput.value = `/${command.name}${suffix}`;
	targetInput.dispatchEvent(new Event("input"));
	targetInput.focus();
}

function renderCommandsInto(listEl, filter, onSelect) {
	const matches = filteredCommands(filter);
	listEl.replaceChildren();

	if (matches.length === 0) {
		const empty = document.createElement("li");
		empty.innerHTML = `<button type="button" disabled><span class="command-desc">${commands.length ? "No matching commands" : "Waiting for Pi commands…"}</span></button>`;
		listEl.appendChild(empty);
		return;
	}

	for (const command of matches) {
		const li = document.createElement("li");
		const btn = document.createElement("button");
		btn.type = "button";
		btn.innerHTML = `<span class="command-name">/${command.name}</span><span class="command-desc">${command.description || command.hint || ""}</span>`;
		btn.addEventListener("click", () => onSelect(command));
		li.appendChild(btn);
		listEl.appendChild(li);
	}
}

function updateSlashCommands(targetInput, containerEl, listEl) {
	const show = targetInput.value.startsWith("/");
	const wasHidden = containerEl.classList.contains("hidden");
	containerEl.classList.toggle("hidden", !show);
	if (!show) return;

	if (wasHidden) animateEnter(containerEl, "anim-fade-down");

	const query = targetInput.value.slice(1).split(/\s/)[0] ?? "";
	renderCommandsInto(listEl, query, (command) => applyCommand(command, targetInput));
}

function updateInlineCommands() {
	updateSlashCommands(inputEl, inlineCommandsEl, inlineCommandsListEl);
}

function updateChatSlashCommands() {
	updateSlashCommands(chatInputEl, chatInlineCommandsEl, chatInlineCommandsListEl);
}

function openCommands(targetInput = getActiveInput()) {
	targetInput.focus();
	if (!targetInput.value.startsWith("/")) {
		targetInput.value = "/";
	}
	targetInput.dispatchEvent(new Event("input"));
	targetInput.setSelectionRange(targetInput.value.length, targetInput.value.length);
}

function closeCommands() {
	inlineCommandsEl.classList.add("hidden");
	chatInlineCommandsEl.classList.add("hidden");
	const target = getActiveInput();
	if (target.value.startsWith("/") && !target.value.slice(1).includes(" ")) {
		target.value = "";
		target.dispatchEvent(new Event("input"));
	}
}

function setCommands(nextCommands) {
	commands = Array.isArray(nextCommands) ? nextCommands : [];
	if (!inlineCommandsEl.classList.contains("hidden")) updateInlineCommands();
	if (!chatInlineCommandsEl.classList.contains("hidden")) updateChatSlashCommands();
}

/* ── WebSocket ── */

function connect() {
	lastError = "";
	gotReady = false;
	sessionId = null;
	creatingSession = false;
	awaitingNewAgentSession = false;
	freshDashboardSession = false;
	pendingDashboardPrompt = null;
	loadingHistory = false;
	clearPendingUserMessage();
	setStatus("connecting");
	ws = new WebSocket(wsUrl);

	ws.addEventListener("open", () => setBusy(false));

	ws.addEventListener("close", () => {
		clearPermissionRequests();
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

			case "models":
				setModels(msg);
				break;

			case "commands":
				setCommands(msg.commands);
				break;

			case "project":
				gitInfo = { ...gitInfo, ...msg };
				if (msg.path) {
					setProjectName(msg.path);
					rememberProject(msg.path);
				}
				pendingProjectPath = null;
				clearProjectPathError();
				syncGitContext();
				renderProjectMenu();
				break;

			case "session":
				sessionId = msg.sessionId ?? null;
				creatingSession = false;
				if (sessionId) {
					upsertSession({
						sessionId,
						title: msg.title ?? null,
						cwd: msg.cwd ?? cwd,
						updatedAt: msg.updatedAt ?? new Date().toISOString(),
					});
				}
				if (awaitingNewAgentSession) {
					awaitingNewAgentSession = false;
					freshDashboardSession = true;
				}
				if (pendingDashboardPrompt) {
					const pending = pendingDashboardPrompt;
					pendingDashboardPrompt = null;
					freshDashboardSession = false;
					deliverPrompt(pending.text, pending.images);
				}
				renderSessions();
				setBusy(busy);
				renderContextUsage();
				break;

			case "history":
				applyHistoryBatch(msg.events);
				break;

			case "clear":
				clearChat();
				loadingHistory = false;
				break;

			case "context":
				setContextUsage(msg);
				break;

			case "status":
				if (msg.cwd) {
					if (gotReady && msg.cwd !== cwd && msg.state === "connecting") {
						resetForProjectSwitch(msg.cwd);
					} else {
						setProjectName(msg.cwd);
					}
				}
				if (msg.state === "ready") {
					if (loadingHistory) {
						flushUserMessage();
						loadingHistory = false;
					}
					gotReady = true;
					connectionState = "ready";
					startupBuffer = "";
					startupSuppressed = false;
					setStatus("ready");
					setBusy(false);
					sessionId = msg.sessionId ?? null;
					if (cwd) rememberProject(cwd);
					renderSessions();
				} else if (msg.state === "busy") {
					setStatus("busy");
					setBusy(true);
					renderSessions();
				} else if (msg.state === "loading_history") {
					loadingHistory = true;
					setStatus("loading_history");
				} else if (msg.state === "connecting") {
					connectionState = "connecting";
					startupBuffer = "";
					startupSuppressed = false;
					setStatus("connecting");
				} else if (msg.state === "error") {
					if (pendingProjectPath) {
						showProjectPathError(msg.message ?? "Could not open that folder.");
						reopenProjectMenu();
						pendingProjectPath = null;
					}
					setStatus("error", msg.message ?? "Error");
				}
				break;

			case "user":
				if (!loadingHistory) break;
				finalizeAssistantTurn();
				addUserMessage(msg.text ?? "", Array.isArray(msg.images) ? msg.images : []);
				break;

			case "user_chunk":
				if (!loadingHistory) break;
				appendUserChunk(msg);
				break;

			case "chunk": {
				if (loadingHistory) flushUserMessage();
				const chunkText = msg.text ?? "";
				if (!shouldSkipStartupContent(chunkText)) appendAssistantChunk(chunkText);
				break;
			}

			case "thought": {
				if (loadingHistory) flushUserMessage();
				const chunkText = msg.text ?? "";
				if (!shouldSkipStartupContent(chunkText)) appendThoughtChunk(chunkText);
				break;
			}

			case "tool":
				if (loadingHistory) flushUserMessage();
				updateToolCard(msg);
				break;

			case "permission_request":
				enqueuePermissionRequest(msg);
				break;

			case "permission":
				addSystemMessage("system", "Permission", formatPermissionResult(msg));
				break;

			case "plan":
				if (loadingHistory) flushUserMessage();
				addSystemMessage("system", "Plan", renderMarkdown("```json\n" + JSON.stringify(msg.entries ?? [], null, 2) + "\n```"));
				break;

			case "done":
				finalizeAssistantTurn();
				contextCompactPending = false;
				setStatus("ready");
				setBusy(false);
				renderSessions();
				break;

			case "error":
				if (pendingProjectPath) {
					showProjectPathError(msg.message ?? "Could not open that folder.");
					reopenProjectMenu();
					pendingProjectPath = null;
				}
				addSystemMessage("error", "Error", msg.message ?? "Unknown error");
				contextCompactPending = false;
				setBusy(false);
				setStatus("ready");
				break;

			default:
				break;
		}
	});
}

/* ── Send prompt ── */

function deliverPrompt(trimmed, images, fromChat = false) {
	const target = fromChat ? chatInputEl : inputEl;

	lastPrompt = trimmed || (images.length ? `[${images.length} image${images.length === 1 ? "" : "s"}]` : "");
	showView("chat");
	addUserMessage(trimmed, images);

	target.value = "";
	resizeTextarea(target);
	clearAttachments(target);

	ws.send(
		JSON.stringify({
			type: "prompt",
			text: trimmed,
			images: images.map(({ mimeType, data }) => ({ mimeType, data })),
		}),
	);
}

function sendPrompt(text, fromChat = false) {
	const target = fromChat ? chatInputEl : inputEl;
	const trimmed = text.trim();
	const attachments = [...getAttachmentsFor(target)];
	if ((!trimmed && attachments.length === 0) || !ws || ws.readyState !== WebSocket.OPEN || busy) return;

	const images = attachments.map(({ name, mimeType, data, previewUrl }) => ({
		name,
		mimeType,
		data,
		previewUrl,
	}));

	if (!fromChat && (!sessionId || !freshDashboardSession)) {
		pendingDashboardPrompt = { text: trimmed, images };
		awaitingNewAgentSession = true;
		if (!creatingSession) newSession();
		return;
	}

	freshDashboardSession = false;
	deliverPrompt(trimmed, images, fromChat);
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
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		composerEl.requestSubmit();
	}
});

inputEl.addEventListener("input", () => {
	resizeTextarea(inputEl);
	setBusy(busy);
	updateInlineCommands();
});

chatInputEl.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		chatComposerEl.requestSubmit();
	}
});

chatInputEl.addEventListener("input", () => {
	resizeTextarea(chatInputEl);
	updateChatSlashCommands();
});

$("nav-dashboard").addEventListener("click", () => {
	setNavActive("dashboard");
	showView("dashboard");
});

$("back-to-dashboard").addEventListener("click", () => {
	showView("dashboard");
});

searchBtnEl.addEventListener("click", () => {
	sidebarSearchEl.classList.toggle("hidden");
	if (!sidebarSearchEl.classList.contains("hidden")) searchInputEl.focus();
});

searchInputEl.addEventListener("input", () => {
	searchQuery = searchInputEl.value;
	renderSessions();
});

commandsHintEl.addEventListener("click", () => openCommands(inputEl));

document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") closeCommands();
	if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
		e.preventDefault();
		cycleActivityArtStyle();
		return;
	}
	if (e.key === "/" && document.activeElement !== inputEl && document.activeElement !== chatInputEl) {
		e.preventDefault();
		openCommands();
	}
});

attachBtnEl.addEventListener("click", () => {
	attachTarget = inputEl;
	fileInputEl.click();
});

$("chat-attach-btn")?.addEventListener("click", () => {
	attachTarget = chatInputEl;
	fileInputEl.click();
});

fileInputEl.addEventListener("change", () => {
	const file = fileInputEl.files?.[0];
	if (file && attachTarget) {
		addImageAttachment(file, attachTarget);
		attachTarget.focus();
	}
	fileInputEl.value = "";
});

$("file-context-toggle")?.addEventListener("click", () => {
	fileContextCollapsed = !fileContextCollapsed;
	renderFileContext();
});

/* ── Init ── */

initDropdowns();
initContextDialPopover();
initPermissionModal();
fetchGitInfo();
connect();
showView("dashboard", { animate: false });
