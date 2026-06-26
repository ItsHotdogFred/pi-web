import { app } from "../state/store.js";
import { wsUrl } from "../config.js";
import { resetStartupSuppression, shouldSkipStartupContent } from "../utils/tools.js";
import { setStatus, setBusy } from "../ui/status.js";
import {
	isStaleSwitchMessage,
	finishSessionSwitchAnimation,
	cancelSessionSwitchAnimation,
} from "../ui/views.js";
import { setModels } from "../ui/models.js";
import { setCommands } from "../commands/palette.js";
import {
	setProjectName,
	rememberProject,
	renderProjectMenu,
	showProjectPathError,
	reopenProjectMenu,
	resetForProjectSwitch,
	clearProjectPathError,
} from "../project/menu.js";
import { syncGitContext } from "../project/git.js";
import { renderSessions, upsertSession, switchSession } from "../dashboard/sessions.js";
import { loadContributions } from "../dashboard/contributions.js";
import { setContextUsage, renderContextUsage } from "../context/dial.js";
import {
	clearPendingUserMessage,
	flushUserMessage,
	appendUserChunk,
	applyHistoryBatch,
} from "../chat/history.js";
import {
	addUserMessage,
	addSystemMessage,
	appendAssistantChunk,
	appendThoughtChunk,
	finalizeAssistantTurn,
	clearChat,
} from "../chat/messages.js";
import { updateToolCard, renderPlanPanel } from "../chat/tools.js";
import {
	enqueuePermissionRequest,
	formatPermissionResult,
	clearPermissionRequests,
} from "../permissions/modal.js";
import {
	scheduleAgentDefaultsFetch,
	maybePromptForNotifications,
	notifyTaskComplete,
} from "../notifications/prompt.js";
import { deliverPrompt } from "./send.js";

const RECONNECT_INTERVAL_MS = 5000;

let reconnectTimer = null;
let connectionGeneration = 0;
/** @type {string | null} */
let resumeSessionId = null;

function clearReconnectTimer() {
	if (reconnectTimer) {
		clearTimeout(reconnectTimer);
		reconnectTimer = null;
	}
}

function scheduleReconnect() {
	clearReconnectTimer();
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connect(true);
	}, RECONNECT_INTERVAL_MS);
}

function resetConnectionState(isReconnect) {
	app.lastError = "";
	app.gotReady = false;
	app.creatingSession = false;
	app.awaitingNewAgentSession = false;
	app.freshDashboardSession = false;
	app.pendingDashboardPrompt = null;
	app.loadingHistory = false;
	clearPendingUserMessage();
	app.defaultsRequested = false;
	app.wasBusyForNotification = false;

	if (isReconnect) {
		if (app.sessionId) resumeSessionId = app.sessionId;
	} else {
		app.sessionId = null;
		resumeSessionId = null;
	}
}

export function connect(isReconnect = false) {
	clearReconnectTimer();
	connectionGeneration += 1;
	const generation = connectionGeneration;

	if (app.ws) {
		try {
			app.ws.close();
		} catch {
			// ignore
		}
		app.ws = null;
	}

	resetConnectionState(isReconnect);
	setStatus("connecting");
	app.ws = new WebSocket(wsUrl);

	app.ws.addEventListener("open", () => {
		if (generation !== connectionGeneration) return;
		setBusy(false);
	});

	app.ws.addEventListener("close", () => {
		if (generation !== connectionGeneration) return;
		clearPermissionRequests();
		setStatus("error", app.gotReady ? "Disconnected" : app.lastError || "Disconnected");
		setBusy(false);
		scheduleReconnect();
	});

	app.ws.addEventListener("error", () => {
		if (generation !== connectionGeneration) return;
		if (!app.gotReady) app.lastError = "Connection failed";
	});

	app.ws.addEventListener("message", (event) => {
		if (generation !== connectionGeneration) return;

		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}

		if (isStaleSwitchMessage(msg)) return;

		switch (msg.type) {
			case "sessions":
				app.sessions = Array.isArray(msg.sessions) ? msg.sessions : [];
				renderSessions();
				break;

			case "models":
				setModels(msg);
				break;

			case "commands":
				setCommands(msg.commands);
				break;

			case "project":
				app.gitInfo = { ...app.gitInfo, ...msg };
				if (msg.path) {
					setProjectName(msg.path);
					rememberProject(msg.path);
				}
				app.pendingProjectPath = null;
				clearProjectPathError();
				syncGitContext();
				renderProjectMenu();
				break;

			case "session":
				app.sessionId = msg.sessionId ?? null;
				app.creatingSession = false;
				if (app.sessionId && !(app.pendingDashboardPrompt && msg.title == null)) {
					const entry = {
						sessionId: app.sessionId,
						title: msg.title ?? null,
						cwd: msg.cwd ?? app.cwd,
					};
					if (msg.updatedAt) entry.updatedAt = msg.updatedAt;
					upsertSession(entry);
				}
				if (app.awaitingNewAgentSession) {
					app.awaitingNewAgentSession = false;
					app.freshDashboardSession = true;
				}
				if (app.pendingDashboardPrompt) {
					const pending = app.pendingDashboardPrompt;
					app.pendingDashboardPrompt = null;
					app.freshDashboardSession = false;
					deliverPrompt(pending.text, pending.images);
				}
				renderSessions();
				setBusy(app.busy);
				renderContextUsage();
				finishSessionSwitchAnimation(msg.requestId);
				break;

			case "history":
				applyHistoryBatch(msg.events);
				finishSessionSwitchAnimation(msg.requestId);
				break;

			case "clear":
				clearChat();
				app.loadingHistory = false;
				app.startupBuffer = "";
				app.startupInfoSkipped = false;
				app.startupBufferChunks = 0;
				app.suppressStartupDump = true;
				break;

			case "context":
				setContextUsage(msg);
				break;

			case "status":
				if (msg.cwd) {
					if (app.gotReady && msg.cwd !== app.cwd && msg.state === "connecting") {
						resetForProjectSwitch(msg.cwd);
					} else {
						setProjectName(msg.cwd);
					}
				}
				if (msg.state === "ready") {
					if (app.loadingHistory) {
						flushUserMessage();
						app.loadingHistory = false;
					}
					app.gotReady = true;
					app.connectionState = "ready";
					app.startupBuffer = "";
					app.startupInfoSkipped = false;
					app.startupBufferChunks = 0;
					setStatus("ready");
					setBusy(false);
					app.sessionId = msg.sessionId ?? null;
					if (app.cwd) rememberProject(app.cwd);
					renderSessions();
					scheduleAgentDefaultsFetch();
					setTimeout(maybePromptForNotifications, 1000);
					finishSessionSwitchAnimation(msg.requestId);
					if (resumeSessionId && app.ws?.readyState === WebSocket.OPEN) {
						const sessionId = resumeSessionId;
						resumeSessionId = null;
						switchSession(sessionId);
					}
				} else if (msg.state === "busy") {
					setStatus("busy");
					setBusy(true);
					renderSessions();
				} else if (msg.state === "loading_history") {
					app.loadingHistory = true;
					setStatus("loading_history");
				} else if (msg.state === "connecting") {
					app.connectionState = "connecting";
					resetStartupSuppression();
					app.suppressStartupDump = true;
					setStatus("connecting");
				} else if (msg.state === "error") {
					if (app.pendingProjectPath) {
						showProjectPathError(msg.message ?? "Could not open that folder.");
						reopenProjectMenu();
						app.pendingProjectPath = null;
					}
					cancelSessionSwitchAnimation();
					setStatus("error", msg.message ?? "Error");
				}
				break;

			case "user":
				if (!app.loadingHistory) break;
				finalizeAssistantTurn();
				addUserMessage(msg.text ?? "", Array.isArray(msg.images) ? msg.images : []);
				break;

			case "user_chunk":
				if (!app.loadingHistory) break;
				appendUserChunk(msg);
				break;

			case "chunk": {
				if (app.loadingHistory) flushUserMessage();
				const chunkText = msg.text ?? "";
				if (!shouldSkipStartupContent(chunkText)) appendAssistantChunk(chunkText);
				break;
			}

			case "thought": {
				if (app.loadingHistory) flushUserMessage();
				const chunkText = msg.text ?? "";
				if (!shouldSkipStartupContent(chunkText)) appendThoughtChunk(chunkText);
				break;
			}

			case "tool":
				if (app.loadingHistory) flushUserMessage();
				updateToolCard(msg);
				break;

			case "permission_request":
				enqueuePermissionRequest(msg);
				break;

			case "permission":
				addSystemMessage("system", "Permission", formatPermissionResult(msg));
				break;

			case "plan":
				if (app.loadingHistory) flushUserMessage();
				renderPlanPanel(msg.entries);
				break;

			case "done":
				finalizeAssistantTurn();
				app.contextCompactPending = false;
				resetStartupSuppression();
				setStatus("ready");
				setBusy(false);
				renderSessions();
				notifyTaskComplete();
				app.wasBusyForNotification = false;
				void loadContributions({ refresh: true });
				break;

			case "error":
				if (app.pendingProjectPath) {
					showProjectPathError(msg.message ?? "Could not open that folder.");
					reopenProjectMenu();
					app.pendingProjectPath = null;
				}
				cancelSessionSwitchAnimation();
				addSystemMessage("error", "Error", msg.message ?? "Unknown error");
				app.contextCompactPending = false;
				setBusy(false);
				app.wasBusyForNotification = false;
				setStatus("ready");
				break;

			default:
				break;
		}
	});
}
