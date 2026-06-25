/* pi-web — browser dashboard for Pi */

const $ = (id) => document.getElementById(id);

const todayListEl = $("today-list");
const activityFeedEl = $("activity-feed");
const contribGraphCountEl = $("contrib-graph-count");
const contribGraphWeeksEl = $("contrib-graph-weeks");
const contribGraphMonthsEl = $("contrib-graph-months");
const contribGraphLearnEl = $("contrib-graph-learn");
const contribGraphNoteEl = $("contrib-graph-note");
const dashboardViewEl = $("dashboard-view");
const chatViewEl = $("chat-view");
const chatAreaEl = $("chat-area");
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
const EDITOR_PREF_KEY = "pi-web-preferred-editor";
const NOTIFICATIONS_PREF_KEY = "pi-web-notifications";

const EDITOR_OPTIONS = [
	{ id: "vscode", label: "VS Code" },
	{ id: "cursor", label: "Cursor" },
	{ id: "zed", label: "Zed" },
];

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
let sessionSwitchAnimating = false;
let sessionSwitchRequestId = 0;
let activeSessionSwitchRequestId = null;
let sessionSwitchAnimationToken = 0;
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

const notificationPromptModalEl = $("notification-prompt-modal");
const notificationPromptEnableEl = $("notification-prompt-enable");
const notificationPromptDismissEl = $("notification-prompt-dismiss");

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

function getNotificationPref() {
	try {
		return localStorage.getItem(NOTIFICATIONS_PREF_KEY);
	} catch {
		return null;
	}
}

function setNotificationPref(value) {
	try {
		localStorage.setItem(NOTIFICATIONS_PREF_KEY, value);
	} catch {
		// ignore storage failures
	}
}

function setNotificationPromptOpen(open) {
	if (!notificationPromptModalEl) return;
	notificationPromptModalEl.classList.toggle("hidden", !open);
	notificationPromptModalEl.setAttribute("aria-hidden", String(!open));
}

function maybePromptForNotifications() {
	if (!("Notification" in window)) return;
	if (getNotificationPref() !== null) return;
	setNotificationPromptOpen(true);
	notificationPromptEnableEl?.focus();
}

async function enableTaskNotifications() {
	setNotificationPromptOpen(false);
	if (!("Notification" in window)) {
		setNotificationPref("disabled");
		return;
	}
	const result =
		Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
	setNotificationPref(result === "granted" ? "enabled" : "disabled");
}

function dismissTaskNotifications() {
	setNotificationPref("disabled");
	setNotificationPromptOpen(false);
}

function requestAgentDefaults() {
	if (defaultsRequested || !ws || ws.readyState !== WebSocket.OPEN) return;
	defaultsRequested = true;
	ws.send(JSON.stringify({ type: "fetch_defaults" }));
}

function scheduleAgentDefaultsFetch() {
	if (defaultsRequested || models.length > 0) return;
	const run = () => requestAgentDefaults();
	if ("requestIdleCallback" in window) {
		requestIdleCallback(run, { timeout: 5000 });
	} else {
		setTimeout(run, 2500);
	}
}

function notifyTaskComplete() {
	if (getNotificationPref() !== "enabled") return;
	if (!("Notification" in window) || Notification.permission !== "granted") return;
	if (!wasBusyForNotification) return;
	if (!document.hidden && currentView === "chat") return;

	const active = sessions.find((s) => s.sessionId === sessionId);
	const title = active ? sessionTitle(active) : "Pi";
	try {
		new Notification("Pi finished", {
			body: `${title} completed its task`,
			icon: "/favicon.svg",
		});
	} catch {
		// ignore notification failures
	}
}

function initNotificationPrompt() {
	if (!notificationPromptModalEl) return;

	notificationPromptEnableEl?.addEventListener("click", () => {
		void enableTaskNotifications();
	});
	notificationPromptDismissEl?.addEventListener("click", dismissTaskNotifications);
	$("notification-prompt-backdrop")?.addEventListener("click", dismissTaskNotifications);
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
const fileDiffs = new Map();
let activePlanPanel = null;

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
let defaultsRequested = false;
let wasBusyForNotification = false;

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

function escapeHtml(text) {
	return String(text)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function renderMarkdown(text) {
	if (window.marked?.parse) {
		return window.marked.parse(text, { breaks: true });
	}
	return escapeHtml(text).replaceAll("\n", "<br>");
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

function startSessionSwitchAnimation() {
	if (sessionSwitchAnimating) {
		if (!prefersReducedMotion() && chatAreaEl) {
			chatAreaEl.classList.remove("view-entering");
			if (!chatAreaEl.classList.contains("view-leaving")) {
				chatAreaEl.classList.add("session-switch-hidden");
			}
		}
		return;
	}

	sessionSwitchAnimating = true;
	const token = ++sessionSwitchAnimationToken;
	if (prefersReducedMotion() || !chatAreaEl) return;
	chatAreaEl.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
	chatAreaEl.classList.add("view-leaving");
	chatAreaEl.addEventListener(
		"animationend",
		() => {
			if (token !== sessionSwitchAnimationToken) return;
			chatAreaEl.classList.remove("view-leaving");
			chatAreaEl.classList.add("session-switch-hidden");
		},
		{ once: true },
	);
}

function finishSessionSwitchAnimation(requestId = null) {
	if (requestId == null && activeSessionSwitchRequestId != null) return;
	if (requestId != null && requestId !== activeSessionSwitchRequestId) return;
	if (!sessionSwitchAnimating) return;
	const token = ++sessionSwitchAnimationToken;
	if (prefersReducedMotion() || !chatAreaEl) {
		sessionSwitchAnimating = false;
		return;
	}
	chatAreaEl.classList.remove("view-leaving", "session-switch-hidden");
	chatAreaEl.classList.add("view-entering");
	chatAreaEl.addEventListener(
		"animationend",
		() => {
			if (token !== sessionSwitchAnimationToken) return;
			chatAreaEl.classList.remove("view-entering");
			sessionSwitchAnimating = false;
		},
		{ once: true },
	);
}

function cancelSessionSwitchAnimation() {
	sessionSwitchAnimationToken++;
	sessionSwitchAnimating = false;
	activeSessionSwitchRequestId = null;
	chatAreaEl?.classList.remove("view-leaving", "view-entering", "session-switch-hidden");
}

function isStaleSwitchMessage(msg) {
	return msg.requestId != null && msg.requestId !== activeSessionSwitchRequestId;
}

function showView(view, { animate = true } = {}) {
	if (view !== "chat") cancelSessionSwitchAnimation();
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
	if (view === "dashboard") animateActivityFeed = animate && activityFeedEl.childElementCount === 0;

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
		if (view === "dashboard") void loadContributions();
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
					if (view === "dashboard") void loadContributions();
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
	void loadContributions();
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
	if (nextBusy) wasBusyForNotification = true;
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

	if (models.length === 0) requestAgentDefaults();

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

/* ── Contribution graph ── */

const CONTRIB_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
let contributionsLoading = false;
let contributionsRequestId = 0;

function contributionLevel(count) {
	if (count <= 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4;
}

function formatContributionTooltip(dateKey, count) {
	const date = new Date(`${dateKey}T12:00:00Z`);
	const label = date.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	const noun = count === 1 ? "contribution" : "contributions";
	return count > 0 ? `${count} ${noun} on ${label}` : `No contributions on ${label}`;
}

function buildHeatmapWeeks(dayData, rangeStart, rangeEnd) {
	const start = new Date(`${rangeStart}T00:00:00Z`);
	const end = new Date(`${rangeEnd}T00:00:00Z`);
	const gridStart = new Date(start);
	gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

	const weeks = [];
	const cursor = new Date(gridStart);

	while (true) {
		const week = [];
		for (let day = 0; day < 7; day += 1) {
			const key = cursor.toISOString().slice(0, 10);
			const inRange = cursor >= start && cursor <= end;
			week.push({
				date: key,
				count: inRange ? (dayData[key] ?? 0) : 0,
				inRange,
				future: cursor > end,
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		weeks.push(week);
		if (cursor > end) break;
	}

	return weeks;
}

function renderContributionGraph(payload) {
	if (!contribGraphWeeksEl || !contribGraphCountEl) return;

	const dayData = payload?.days && typeof payload.days === "object" ? payload.days : {};
	const total = typeof payload?.total === "number" ? payload.total : 0;
	const rangeStart = payload?.start ?? Object.keys(dayData).sort()[0];
	const rangeEnd = payload?.end ?? Object.keys(dayData).sort().at(-1);

	if (!rangeStart || !rangeEnd) {
		contribGraphCountEl.textContent = "No contribution data yet";
		contribGraphWeeksEl.replaceChildren();
		if (contribGraphMonthsEl) contribGraphMonthsEl.replaceChildren();
		return;
	}

	contribGraphCountEl.innerHTML = `<strong>${total.toLocaleString()}</strong> contribution${total === 1 ? "" : "s"} in the last year`;

	const weeks = buildHeatmapWeeks(dayData, rangeStart, rangeEnd);
	contribGraphWeeksEl.replaceChildren();

	if (contribGraphMonthsEl) {
		contribGraphMonthsEl.replaceChildren();
		let lastMonth = -1;
		for (const week of weeks) {
			const monthEl = document.createElement("span");
			monthEl.className = "contrib-graph-month";
			monthEl.style.width = "14px";
			const firstInRange = week.find((day) => day.inRange);
			if (firstInRange) {
				const month = new Date(`${firstInRange.date}T12:00:00Z`).getUTCMonth();
				if (month !== lastMonth) {
					monthEl.textContent = CONTRIB_MONTHS[month];
					lastMonth = month;
				}
			}
			contribGraphMonthsEl.appendChild(monthEl);
		}
	}

	for (const week of weeks) {
		const weekEl = document.createElement("div");
		weekEl.className = "contrib-graph-week";

		for (const day of week) {
			const cell = document.createElement("span");
			cell.className = "contrib-cell";
			if (!day.inRange || day.future) {
				cell.classList.add("is-future");
			} else {
				cell.classList.add(`level-${contributionLevel(day.count)}`);
				cell.title = formatContributionTooltip(day.date, day.count);
			}
			weekEl.appendChild(cell);
		}

		contribGraphWeeksEl.appendChild(weekEl);
	}
}

async function loadContributions({ refresh = false } = {}) {
	if (!contribGraphWeeksEl || contributionsLoading) return;

	const requestId = ++contributionsRequestId;
	contributionsLoading = true;

	try {
		const params = new URLSearchParams();
		if (cwd) params.set("cwd", cwd);
		if (refresh) params.set("refresh", "1");
		const query = params.toString();
		const response = await fetch(`/api/contributions${query ? `?${query}` : ""}`);
		if (!response.ok) throw new Error("Failed to load contributions");
		const payload = await response.json();
		if (requestId !== contributionsRequestId) return;
		renderContributionGraph(payload);
	} catch {
		if (requestId !== contributionsRequestId) return;
		if (contribGraphCountEl) contribGraphCountEl.textContent = "Could not load contribution activity";
	} finally {
		if (requestId === contributionsRequestId) contributionsLoading = false;
	}
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

	const switchingSession = currentView === "chat" && id !== sessionId;
	const requestId = switchingSession ? ++sessionSwitchRequestId : null;
	if (switchingSession) {
		activeSessionSwitchRequestId = requestId;
		startSessionSwitchAnimation();
	}
	sessionId = id;
	renderSessions();
	switchSession(id, requestId);
	showView("chat");
}

function switchSession(id, requestId = null) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify({ type: "switch_session", sessionId: id, requestId }));
}

function newSession() {
	if (!ws || ws.readyState !== WebSocket.OPEN || creatingSession) return;
	cancelSessionSwitchAnimation();
	creatingSession = true;
	setBusy(busy);
	ws.send(JSON.stringify({ type: "new_session" }));
}

function clearChangedFiles() {
	changedFiles.clear();
	fileDiffs.clear();
	renderFileContext();
}

function fileLangTag(path) {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	return LANG_TAGS[ext] || ext.toUpperCase().slice(0, 4) || "FILE";
}

function parseToolPayload(raw) {
	if (raw == null) return null;
	if (typeof raw === "object") {
		if (raw.truncated && typeof raw.preview === "string") {
			try {
				return JSON.parse(raw.preview);
			} catch {
				return null;
			}
		}
		return raw;
	}
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function buildEditDiffFromInput(input) {
	const path = extractFilePath(input) ?? "file";

	if (Array.isArray(input.edits) && input.edits.length) {
		const lines = [`--- a/${path}`, `+++ b/${path}`];
		for (const edit of input.edits) {
			const oldText = String(edit.oldText ?? edit.old_string ?? "");
			const newText = String(edit.newText ?? edit.new_string ?? "");
			if (oldText) {
				for (const line of oldText.split("\n")) lines.push(`-${line}`);
			}
			if (newText) {
				for (const line of newText.split("\n")) lines.push(`+${line}`);
			}
		}
		return lines.length > 2 ? lines.join("\n") : null;
	}

	const oldText = input.oldText ?? input.old_string;
	const newText = input.newText ?? input.new_string;
	if (oldText != null || newText != null) {
		return buildSyntheticDiff({
			path,
			old_string: oldText ?? "",
			new_string: newText ?? "",
		});
	}

	return null;
}

function extractFilePath(payload) {
	if (!payload || typeof payload !== "object") return null;
	return payload.path || payload.file_path || payload.filePath || payload.file || payload.target || null;
}

function resolveAbsolutePath(path) {
	if (!path) return "";
	const normalized = String(path).replace(/\\/g, "/");
	if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) return normalized;
	const base = (cwd || gitInfo.path || "").replace(/\\/g, "/").replace(/\/$/, "");
	if (!base) return normalized.replace(/^\.\//, "");
	return `${base}/${normalized.replace(/^\.\//, "")}`;
}

function getPreferredEditor() {
	try {
		const stored = localStorage.getItem(EDITOR_PREF_KEY);
		if (stored && EDITOR_OPTIONS.some((option) => option.id === stored)) return stored;
	} catch {
		/* ignore */
	}
	return "cursor";
}

function setPreferredEditor(editorId) {
	try {
		localStorage.setItem(EDITOR_PREF_KEY, editorId);
	} catch {
		/* ignore */
	}
	renderFileContext();
}

function buildEditorUrl(editorId, filePath, line = 1) {
	const abs = resolveAbsolutePath(filePath);
	const path = abs.replace(/\\/g, "/");
	const loc = line > 1 ? `:${line}` : "";
	switch (editorId) {
		case "cursor":
			return `cursor://file/${path}${loc}`;
		case "zed":
			return `zed://file/${path}${loc}`;
		default:
			return `vscode://file/${path}${loc}`;
	}
}

function openInEditor(filePath, line = 1) {
	const url = buildEditorUrl(getPreferredEditor(), filePath, line);
	window.location.href = url;
}

function looksLikeUnifiedDiff(text) {
	if (!text || typeof text !== "string") return false;
	const trimmed = text.trim();
	return /^(\-\-\-|\+\+\+|@@)/m.test(trimmed);
}

function extractDiffFromTool(state) {
	const toolName = resolveToolName(state)?.toLowerCase() ?? "";
	const parsed = parseRawObject(state.rawOutput);
	if (parsed?.details?.diff && typeof parsed.details.diff === "string") return parsed.details.diff;
	if (parsed?.diff && typeof parsed.diff === "string") return parsed.diff;

	if (typeof state.rawOutput === "string" && looksLikeUnifiedDiff(state.rawOutput)) {
		return state.rawOutput;
	}

	const formatted = formatRaw(state.rawOutput);
	if (looksLikeUnifiedDiff(formatted)) return formatted;

	const input = parseToolPayload(state.rawInput);
	if (input) {
		const editDiff = buildEditDiffFromInput(input);
		if (editDiff) return editDiff;

		const writeContent = input.content ?? input.text;
		if ((toolName === "write" || toolName === "create") && writeContent != null) {
			return buildWriteDiff({ ...input, content: writeContent });
		}
	}

	return null;
}

function buildWriteDiff(input) {
	const path = extractFilePath(input) ?? "file";
	const content = String(input.content ?? "");
	if (!content.trim()) return null;
	const contentLines = content.split("\n");
	const lines = [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${contentLines.length} @@`];
	for (const line of contentLines) {
		lines.push(`+${line}`);
	}
	return lines.join("\n");
}

function buildSyntheticDiff(input) {
	const path = extractFilePath(input) ?? "file";
	const oldText = String(input.old_string ?? "");
	const newText = String(input.new_string ?? input.content ?? "");
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const lines = [`--- a/${path}`, `+++ b/${path}`];
	const max = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < max; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];
		if (oldLine === newLine) {
			if (oldLine !== undefined) lines.push(` ${oldLine}`);
		} else {
			if (oldLine !== undefined) lines.push(`-${oldLine}`);
			if (newLine !== undefined) lines.push(`+${newLine}`);
		}
	}
	return lines.join("\n");
}

function isDiffToolName(name) {
	return /^(edit|write|patch|replace|create)$/.test(String(name ?? "").toLowerCase());
}

function renderDiffView(diffText) {
	const lines = String(diffText).split("\n");
	let html = '<div class="diff-view" tabindex="0">';
	for (const line of lines) {
		let cls = "diff-line";
		if (line.startsWith("---") || line.startsWith("+++")) cls += " diff-line-meta";
		else if (line.startsWith("@@")) cls += " diff-line-hunk";
		else if (line.startsWith("+")) cls += " diff-line-add";
		else if (line.startsWith("-")) cls += " diff-line-del";
		else cls += " diff-line-ctx";

		const gutter = line.length ? line[0] : " ";
		const body = line.length > 1 ? line.slice(1) : line === "+" || line === "-" ? "" : line;
		html += `<div class="${cls}"><span class="diff-gutter">${escapeHtml(gutter)}</span><code>${escapeHtml(body)}</code></div>`;
	}
	html += "</div>";
	return html;
}

function syncToolDiffSection(card, diff, filePath) {
	let section = card.querySelector(".tool-diff-section");
	const outputSection = card.querySelector(".tool-output-section");
	const inputSection = card.querySelector(".tool-input-section");

	if (!diff) {
		section?.remove();
		delete card.dataset.diffPath;
		if (outputSection) outputSection.style.display = "";
		if (inputSection) inputSection.style.display = "";
		return;
	}

	if (!section) {
		section = document.createElement("div");
		section.className = "tool-section tool-diff-section";
		section.innerHTML = `<div class="tool-section-label">Diff</div><div class="tool-diff"></div>`;
		const body = card.querySelector(".tool-body");
		const output = card.querySelector(".tool-output-section");
		if (output) body.insertBefore(section, output);
		else body.appendChild(section);
	}

	section.style.display = "";
	section.querySelector(".tool-diff").innerHTML = renderDiffView(diff);
	if (filePath) card.dataset.diffPath = resolveAbsolutePath(filePath);
	else delete card.dataset.diffPath;

	if (inputSection) inputSection.style.display = "none";
	if (outputSection) {
		const outputText = card.querySelector(".tool-output")?.textContent?.trim();
		outputSection.style.display = outputText ? "" : "none";
	}

	if (!card.classList.contains("expanded")) {
		card.classList.add("expanded");
		card.querySelector(".tool-header")?.setAttribute("aria-expanded", "true");
	}
}

function scrollToToolDiff(filePath) {
	const abs = resolveAbsolutePath(filePath);
	const cards = messagesEl.querySelectorAll("[data-diff-path]");
	for (const card of cards) {
		if (card.dataset.diffPath === abs) {
			card.classList.add("expanded");
			card.querySelector(".tool-header")?.setAttribute("aria-expanded", "true");
			card.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}
	}
}

function resetPlanPanel() {
	activePlanPanel = null;
}

function normalizePlanEntry(entry) {
	if (typeof entry === "string") {
		return { content: entry, priority: "medium", status: "pending" };
	}
	return {
		content: entry?.content ?? entry?.description ?? entry?.text ?? "Task",
		priority: entry?.priority ?? "medium",
		status: entry?.status ?? "pending",
	};
}

function planStatusIcon(status) {
	switch (status) {
		case "completed":
			return "✓";
		case "in_progress":
			return "◌";
		default:
			return "○";
	}
}

function renderPlanPanel(entries) {
	const normalized = (Array.isArray(entries) ? entries : []).map(normalizePlanEntry);
	if (!normalized.length) return null;

	let panel = activePlanPanel;
	if (!panel?.isConnected) {
		panel = document.createElement("article");
		panel.className = "msg msg-plan plan-panel";
		panel.innerHTML = `<span class="msg-label">Plan</span><ol class="plan-list"></ol>`;
		appendChatNode(panel);
		if (!batchHistoryMode) animateEnter(panel, "anim-fade-up");
		activePlanPanel = panel;
	}

	const list = panel.querySelector(".plan-list");
	list.replaceChildren();
	for (const entry of normalized) {
		const li = document.createElement("li");
		li.className = `plan-item plan-item--${entry.status} plan-item--priority-${entry.priority}`;
		const priorityHtml =
			entry.priority !== "medium"
				? `<span class="plan-priority plan-priority--${entry.priority}">${entry.priority}</span>`
				: "";
		li.innerHTML = `
			<span class="plan-status" aria-hidden="true">${planStatusIcon(entry.status)}</span>
			<span class="plan-text">${escapeHtml(entry.content)}</span>
			${priorityHtml}`;
		list.appendChild(li);
	}
	scrollToBottom();
	return panel;
}

function renderFileContextEditorPicker() {
	let picker = fileContextEl?.querySelector(".file-context-editor-picker");
	if (!picker && fileContextEl) {
		const header = fileContextEl.querySelector(".file-context-header");
		if (!header) return;
		picker = document.createElement("div");
		picker.className = "file-context-editor-picker";
		picker.setAttribute("role", "group");
		picker.setAttribute("aria-label", "Open files in");
		picker.addEventListener("click", (event) => event.stopPropagation());
		header.appendChild(picker);
	}

	if (!picker) return;

	const preferred = getPreferredEditor();
	picker.replaceChildren();
	for (const option of EDITOR_OPTIONS) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `file-context-editor-btn${option.id === preferred ? " active" : ""}`;
		btn.textContent = option.label;
		btn.title = `Open files in ${option.label}`;
		btn.addEventListener("click", (event) => {
			event.stopPropagation();
			setPreferredEditor(option.id);
		});
		picker.appendChild(btn);
	}
}

function trackFileFromTool(state) {
	const toolName = resolveToolName(state).toLowerCase();
	if (!/(write|edit|patch|replace|create|fs)/.test(toolName)) return;

	const payload = parseToolPayload(state.rawInput);
	const path = extractFilePath(payload);
	if (!path) return;

	changedFiles.add(path);

	const diff = extractDiffFromTool(state);
	if (diff) fileDiffs.set(path, diff);

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
	renderFileContextEditorPicker();

	listEl.replaceChildren();
	for (const path of files) {
		const li = document.createElement("li");
		li.className = "file-context-item";
		const hasDiff = fileDiffs.has(path);

		const fileBtn = document.createElement("button");
		fileBtn.type = "button";
		fileBtn.className = "file-context-file";
		fileBtn.title = resolveAbsolutePath(path);
		fileBtn.innerHTML = `
			<span class="file-context-lang">${fileLangTag(path)}</span>
			<span class="file-context-name">${escapeHtml(basename(path))}</span>`;
		fileBtn.addEventListener("click", () => openInEditor(path));

		const actions = document.createElement("div");
		actions.className = "file-context-actions";

		const openBtn = document.createElement("button");
		openBtn.type = "button";
		openBtn.className = "file-context-action";
		openBtn.textContent = "Open";
		openBtn.title = `Open in ${EDITOR_OPTIONS.find((o) => o.id === getPreferredEditor())?.label ?? "editor"}`;
		openBtn.addEventListener("click", () => openInEditor(path));

		actions.appendChild(openBtn);

		if (hasDiff) {
			const diffBtn = document.createElement("button");
			diffBtn.type = "button";
			diffBtn.className = "file-context-action file-context-action--diff";
			diffBtn.textContent = "Diff";
			diffBtn.addEventListener("click", () => scrollToToolDiff(path));
			actions.appendChild(diffBtn);
		}

		li.append(fileBtn, actions);
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
	resetPlanPanel();
	clearChangedFiles();
	resetContextUsage();
}

function addUserMessage(text, images = []) {
	resetPlanPanel();
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
	// Only anchor before streaming assistant text — not thinking blocks.
	return assistantBlock;
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

function parseRawObject(value) {
	if (value == null || value === "") return null;
	if (typeof value === "object") {
		if (value.truncated) return null;
		return value;
	}
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return null;
}

function isSubagentTool(state) {
	return resolveToolName(state).toLowerCase() === "subagent";
}

function parseSubagentDetails(rawOutput) {
	const obj = parseRawObject(rawOutput);
	if (!obj) return null;
	if (obj.details && Array.isArray(obj.details.results)) return obj.details;
	if (Array.isArray(obj.results) && obj.mode) return obj;
	return null;
}

function subagentFinalOutput(result) {
	if (result?.finalOutput) return result.finalOutput;
	const messages = Array.isArray(result?.messages) ? result.messages : [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part?.type === "text" && part.text) return part.text;
		}
	}
	return "";
}

function subagentDisplayItems(messages) {
	const items = [];
	for (const message of messages ?? []) {
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part?.type === "text" && part.text) items.push({ type: "text", text: part.text });
			else if (part?.type === "toolCall") {
				items.push({ type: "toolCall", name: part.name ?? "tool", args: part.arguments ?? {} });
			}
		}
	}
	return items;
}

function formatSubagentToolCall(name, args) {
	const toolName = normalizeToolName(name) || name || "tool";
	if (toolName === "read" || toolName === "write" || toolName === "edit") {
		const path = args?.path ?? args?.file ?? "";
		return `${toolName} ${path}`;
	}
	if (toolName === "grep") {
		return `grep /${args?.pattern ?? ""}/ in ${args?.path ?? "."}`;
	}
	if (toolName === "shell" || toolName === "bash") {
		const command = String(args?.command ?? "").trim();
		return command.length > 72 ? `shell ${command.slice(0, 72)}…` : `shell ${command}`;
	}
	const preview = JSON.stringify(args ?? {});
	return preview.length > 72 ? `${toolName} ${preview.slice(0, 72)}…` : `${toolName} ${preview}`;
}

function subagentResultStatus(result, toolRunning) {
	if (result.exitCode === -1) return "running";
	if (toolRunning && result.exitCode === 0 && !subagentFinalOutput(result) && !result.errorMessage) {
		return "running";
	}
	if (result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted") {
		return "failed";
	}
	return "completed";
}

function subagentHeaderLabel(details, rawInput) {
	if (!details) {
		const input = parseRawObject(rawInput);
		if (Array.isArray(input?.chain) && input.chain.length) return `subagent · chain (${input.chain.length})`;
		if (Array.isArray(input?.tasks) && input.tasks.length) {
			return `subagent · parallel (${input.tasks.length})`;
		}
		if (input?.agent) return `subagent · ${input.agent}`;
		return "subagent";
	}

	if (details.mode === "chain") return `subagent · chain (${details.results.length})`;
	if (details.mode === "parallel") {
		const running = details.results.filter((result) => result.exitCode === -1).length;
		if (running) {
			const done = details.results.length - running;
			return `subagent · parallel · ${done}/${details.results.length}`;
		}
		return `subagent · parallel (${details.results.length})`;
	}
	if (details.results.length === 1) return `subagent · ${details.results[0].agent}`;
	return "subagent";
}

function subagentStatusLabel(details, toolRunning) {
	if (!details) return toolRunning ? "running" : "done";
	const results = [...details.results];
	if (details.aggregator) results.push(details.aggregator);
	const running = results.filter((result) => subagentResultStatus(result, toolRunning) === "running").length;
	if (running) return `${results.length - running}/${results.length}`;
	const failed = results.filter((result) => subagentResultStatus(result, false) === "failed").length;
	if (failed) return `${failed} failed`;
	return "done";
}

function truncateText(text, max = 220) {
	if (!text) return "";
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max)}…`;
}

function renderSubagentNestedItems(items, expanded) {
	const limit = expanded ? items.length : 5;
	const slice = items.slice(-limit);
	const skipped = items.length - slice.length;
	let html = "";
	if (skipped > 0) {
		html += `<div class="subagent-nested-meta">${skipped} earlier step${skipped === 1 ? "" : "s"}</div>`;
	}
	for (const item of slice) {
		if (item.type === "text") {
			html += `<div class="subagent-nested-text">${renderMarkdown(truncateText(item.text, expanded ? 1200 : 240))}</div>`;
		} else {
			html += `<div class="subagent-nested-tool">→ ${formatSubagentToolCall(item.name, item.args)}</div>`;
		}
	}
	return html;
}

function renderSubagentResult(result, toolRunning, expanded) {
	const status = subagentResultStatus(result, toolRunning);
	const items = subagentDisplayItems(result.messages);
	const output = subagentFinalOutput(result);
	const icon = status === "running" ? "◌" : status === "failed" ? "✗" : "✓";
	const source = result.agentSource ? ` (${result.agentSource})` : "";
	const step =
		typeof result.step === "number" ? `<span class="subagent-item-step">step ${result.step + 1}</span>` : "";

	let body = `<div class="subagent-item-task">${truncateText(result.task, expanded ? 600 : 180)}</div>`;
	if (result.errorMessage) {
		body += `<div class="subagent-item-error">${result.errorMessage}</div>`;
	} else if (items.length) {
		body += `<div class="subagent-item-activity">${renderSubagentNestedItems(items, expanded)}</div>`;
	} else if (status === "running") {
		body += `<div class="subagent-item-meta">Running…</div>`;
	}

	if (output && status !== "running") {
		body += `<div class="subagent-item-output">${renderMarkdown(truncateText(output, expanded ? 4000 : 320))}</div>`;
	} else if (!items.length && !result.errorMessage && status !== "running") {
		body += `<div class="subagent-item-meta">No output</div>`;
	}

	return `<article class="subagent-item subagent-item--${status}">
		<div class="subagent-item-header">
			<span class="subagent-item-icon" aria-hidden="true">${icon}</span>
			<span class="subagent-item-name">${result.agent}${source}</span>
			${step}
			<span class="subagent-item-status">${status}</span>
		</div>
		${body}
	</article>`;
}

function renderSubagentPanel(state) {
	const card = state.el;
	const details = parseSubagentDetails(state.rawOutput);
	const input = parseRawObject(state.rawInput);
	const toolRunning = ["running", "in_progress", "pending"].includes(normalizeStatus(state.status));
	const expanded = card.classList.contains("expanded");
	let html = `<div class="subagent-panel">`;

	if (details) {
		const scope = details.agentScope ? `<span class="subagent-chip">${details.agentScope}</span>` : "";
		html += `<div class="subagent-summary">${scope}<span class="subagent-mode">${details.mode}</span></div>`;
		html += `<div class="subagent-list">`;
		for (const result of details.results) {
			html += renderSubagentResult(result, toolRunning, expanded);
		}
		if (details.aggregator) {
			html += `<div class="subagent-fanin-label">Fan-in</div>`;
			html += renderSubagentResult(details.aggregator, toolRunning, expanded);
		}
		html += `</div>`;
	} else if (input) {
		html += `<div class="subagent-list">`;
		if (Array.isArray(input.chain)) {
			for (const step of input.chain) {
				html += renderSubagentResult(
					{ agent: step.agent, agentSource: "pending", task: step.task, exitCode: -1, messages: [] },
					true,
					expanded,
				);
			}
		} else if (Array.isArray(input.tasks)) {
			for (const task of input.tasks) {
				html += renderSubagentResult(
					{ agent: task.agent, agentSource: "pending", task: task.task, exitCode: -1, messages: [] },
					true,
					expanded,
				);
			}
		} else if (input.agent && input.task) {
			html += renderSubagentResult(
				{ agent: input.agent, agentSource: "pending", task: input.task, exitCode: -1, messages: [] },
				true,
				expanded,
			);
		}
		html += `</div>`;
	} else {
		const fallback = formatRaw(state.rawOutput) || formatRaw(state.rawInput);
		html += fallback
			? `<pre class="subagent-fallback">${fallback}</pre>`
			: `<div class="subagent-item-meta">Waiting for subagent updates…</div>`;
	}

	html += `</div>`;

	let panel = card.querySelector(".subagent-panel");
	const body = card.querySelector(".tool-body");
	if (!panel) {
		body.querySelector(".tool-input-section")?.remove();
		body.querySelector(".tool-output-section")?.remove();
		body.insertAdjacentHTML("afterbegin", html);
	} else {
		panel.outerHTML = html;
	}
}

function syncSubagentToolCard(state) {
	const card = state.el;
	const details = parseSubagentDetails(state.rawOutput);
	const toolRunning = ["running", "in_progress", "pending"].includes(normalizeStatus(state.status));

	card.classList.add("tool-card--subagent");
	card.querySelector(".tool-name").textContent = subagentHeaderLabel(details, state.rawInput);

	const statusBadge = card.querySelector(".tool-status");
	const subagentStatus = subagentStatusLabel(details, toolRunning);
	statusBadge.className = `tool-status tool-status-${toolRunning ? "running" : normalizeStatus(state.status)}`;
	statusBadge.textContent = subagentStatus;

	renderSubagentPanel(state);

	if (toolRunning) {
		card.classList.add("expanded");
		card.querySelector(".tool-header")?.setAttribute("aria-expanded", "true");
	}
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
		const state = toolCards.get(id);
		if (state && isSubagentTool(state)) renderSubagentPanel(state);
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

	if (isSubagentTool(state)) {
		syncSubagentToolCard(state);
		trackFileFromTool(state);
		scrollToBottom();
		return;
	}

	card.classList.remove("tool-card--subagent");
	card.querySelector(".tool-name").textContent = resolveToolName(state);

	const statusBadge = card.querySelector(".tool-status");
	const norm = normalizeStatus(state.status);
	statusBadge.className = `tool-status tool-status-${norm}`;
	statusBadge.textContent = statusLabel(state.status);

	for (const [key, prop] of [["tool-input", state.rawInput], ["tool-output", state.rawOutput]]) {
		const pre = card.querySelector(`.${key}`);
		if (!pre) continue;
		const section = pre.closest(".tool-section");
		const text = formatRaw(prop);
		if (text) {
			pre.textContent = text;
			section.style.display = "";
		} else {
			section.style.display = "none";
		}
	}

	const toolName = resolveToolName(state).toLowerCase();
	const payload = parseToolPayload(state.rawInput);
	const filePath = extractFilePath(payload);
	const diff = isDiffToolName(toolName) ? extractDiffFromTool(state) : null;
	syncToolDiffSection(card, diff, filePath);

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
	const wasHidden = !containerEl.classList.contains("is-open");
	containerEl.classList.toggle("is-open", show);
	containerEl.setAttribute("aria-hidden", String(!show));
	if (!show) {
		listEl.classList.remove("anim-fade-down");
		return;
	}

	if (show && commands.length === 0) requestAgentDefaults();

	if (wasHidden) animateEnter(listEl, "anim-fade-down");

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
	inlineCommandsEl.classList.remove("is-open");
	inlineCommandsEl.setAttribute("aria-hidden", "true");
	chatInlineCommandsEl.classList.remove("is-open");
	chatInlineCommandsEl.setAttribute("aria-hidden", "true");
	const target = getActiveInput();
	if (target.value.startsWith("/") && !target.value.slice(1).includes(" ")) {
		target.value = "";
		target.dispatchEvent(new Event("input"));
	}
}

function setCommands(nextCommands) {
	commands = Array.isArray(nextCommands) ? nextCommands : [];
	if (inlineCommandsEl.classList.contains("is-open")) updateInlineCommands();
	if (chatInlineCommandsEl.classList.contains("is-open")) updateChatSlashCommands();
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
	defaultsRequested = false;
	wasBusyForNotification = false;
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

		if (isStaleSwitchMessage(msg)) return;

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
					const entry = {
						sessionId,
						title: msg.title ?? null,
						cwd: msg.cwd ?? cwd,
					};
					if (msg.updatedAt) entry.updatedAt = msg.updatedAt;
					upsertSession(entry);
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
				finishSessionSwitchAnimation(msg.requestId);
				break;

			case "history":
				applyHistoryBatch(msg.events);
				finishSessionSwitchAnimation(msg.requestId);
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
					scheduleAgentDefaultsFetch();
					setTimeout(maybePromptForNotifications, 1000);
					finishSessionSwitchAnimation(msg.requestId);
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
					cancelSessionSwitchAnimation();
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
				renderPlanPanel(msg.entries);
				break;

			case "done":
				finalizeAssistantTurn();
				contextCompactPending = false;
				setStatus("ready");
				setBusy(false);
				renderSessions();
				notifyTaskComplete();
				wasBusyForNotification = false;
				void loadContributions({ refresh: true });
				break;

			case "error":
				if (pendingProjectPath) {
					showProjectPathError(msg.message ?? "Could not open that folder.");
					reopenProjectMenu();
					pendingProjectPath = null;
				}
				cancelSessionSwitchAnimation();
				addSystemMessage("error", "Error", msg.message ?? "Unknown error");
				contextCompactPending = false;
				setBusy(false);
				wasBusyForNotification = false;
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
initNotificationPrompt();
contribGraphLearnEl?.addEventListener("click", () => {
	contribGraphNoteEl?.classList.toggle("hidden");
});
fetchGitInfo();
connect();
showView("dashboard", { animate: false });
