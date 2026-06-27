import { app } from "../state/store.js";
import { resetStartupSuppression } from "../utils/tools.js";
import { setStatus, setBusy } from "../ui/status.js";
import {
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
	flushUserMessage,
	appendUserChunk,
	applyHistoryBatch,
} from "../chat/history.js";
import { ingestEvent } from "../chat/ingestEvent.js";
import {
	addUserMessage,
	addSystemMessage,
	finalizeAssistantTurn,
	flushMarkdownRender,
	clearChat,
} from "../chat/messages.js";
import {
	enqueuePermissionRequest,
	formatPermissionResult,
} from "../permissions/modal.js";
import {
	scheduleAgentDefaultsFetch,
	maybePromptForNotifications,
	notifyTaskComplete,
} from "../notifications/prompt.js";
import { deliverPrompt } from "./send.js";
import {
	getResumeSessionId,
	clearResumeSessionId,
	resetReconnectAttempts,
} from "./connection.js";

function handleProjectPathError(msg) {
	if (app.project.pendingPath) {
		showProjectPathError(msg.message ?? "Could not open that folder.");
		reopenProjectMenu();
		app.project.pendingPath = null;
	}
}

function handleSessions(msg) {
	app.session.sessions = Array.isArray(msg.sessions) ? msg.sessions : [];
	renderSessions();
}

function handleModels(msg) {
	setModels(msg);
}

function handleCommands(msg) {
	setCommands(msg.commands);
}

function handleProject(msg) {
	app.project.gitInfo = { ...app.project.gitInfo, ...msg };
	if (msg.path) {
		setProjectName(msg.path);
		rememberProject(msg.path);
	}
	app.project.pendingPath = null;
	clearProjectPathError();
	syncGitContext();
	renderProjectMenu();
}

function handleSession(msg) {
	app.session.sessionId = msg.sessionId ?? null;
	app.session.creatingSession = false;
	if (app.session.sessionId && !(app.session.pendingDashboardPrompt && msg.title == null)) {
		const entry = {
			sessionId: app.session.sessionId,
			title: msg.title ?? null,
			cwd: msg.cwd ?? app.session.cwd,
		};
		if (msg.updatedAt) entry.updatedAt = msg.updatedAt;
		upsertSession(entry);
	}
	if (app.session.awaitingNewAgentSession) {
		app.session.awaitingNewAgentSession = false;
		app.session.freshDashboardSession = true;
	}
	if (app.session.pendingDashboardPrompt) {
		const pending = app.session.pendingDashboardPrompt;
		app.session.pendingDashboardPrompt = null;
		app.session.freshDashboardSession = false;
		deliverPrompt(pending.text, pending.images);
	}
	renderSessions();
	setBusy(app.ui.busy);
	renderContextUsage();
	finishSessionSwitchAnimation(msg.requestId);
}

function handleHistory(msg) {
	applyHistoryBatch(msg.events);
	finishSessionSwitchAnimation(msg.requestId);
}

function handleClear() {
	clearChat();
	app.session.loadingHistory = false;
	app.connection.startupBuffer = "";
	app.connection.startupInfoSkipped = false;
	app.connection.startupBufferChunks = 0;
	app.connection.suppressStartupDump = true;
}

function handleContext(msg) {
	setContextUsage(msg);
}

function handleStatus(msg) {
	if (msg.cwd) {
		if (app.connection.gotReady && msg.cwd !== app.session.cwd && msg.state === "connecting") {
			resetForProjectSwitch(msg.cwd);
		} else {
			setProjectName(msg.cwd);
		}
	}
	if (msg.state === "ready") {
		if (app.session.loadingHistory) {
			flushUserMessage();
			app.session.loadingHistory = false;
		}
		resetReconnectAttempts();
		app.connection.gotReady = true;
		app.connection.connectionState = "ready";
		app.connection.startupBuffer = "";
		app.connection.startupInfoSkipped = false;
		app.connection.startupBufferChunks = 0;
		setStatus("ready");
		setBusy(false);
		app.session.sessionId = msg.sessionId ?? null;
		if (app.session.cwd) rememberProject(app.session.cwd);
		renderSessions();
		renderContextUsage();
		scheduleAgentDefaultsFetch({ immediate: app.connection.projectSwitchPending });
		app.connection.projectSwitchPending = false;
		setTimeout(maybePromptForNotifications, 1000);
		finishSessionSwitchAnimation(msg.requestId);
		const resumeSessionId = getResumeSessionId();
		if (resumeSessionId && app.connection.ws?.readyState === WebSocket.OPEN) {
			clearResumeSessionId();
			switchSession(resumeSessionId);
		}
	} else if (msg.state === "busy") {
		setStatus("busy");
		setBusy(true);
		renderSessions();
	} else if (msg.state === "loading_history") {
		app.session.loadingHistory = true;
		setStatus("loading_history");
	} else if (msg.state === "connecting") {
		app.connection.connectionState = "connecting";
		resetStartupSuppression();
		app.connection.suppressStartupDump = true;
		setStatus("connecting");
	} else if (msg.state === "error") {
		handleProjectPathError(msg);
		cancelSessionSwitchAnimation();
		setStatus("error", msg.message ?? "Error");
	}
}

function handleUser(msg) {
	if (!app.session.loadingHistory) return;
	finalizeAssistantTurn();
	addUserMessage(msg.text ?? "", Array.isArray(msg.images) ? msg.images : []);
}

function handleUserChunk(msg) {
	if (!app.session.loadingHistory) return;
	appendUserChunk(msg);
}

function handleChunk(msg) {
	if (app.session.loadingHistory) flushUserMessage();
	ingestEvent(msg, { mode: "stream" });
}

function handleThought(msg) {
	if (app.session.loadingHistory) flushUserMessage();
	ingestEvent(msg, { mode: "stream" });
}

function handleTool(msg) {
	if (app.session.loadingHistory) flushUserMessage();
	ingestEvent(msg, { mode: "stream" });
}

function handlePermissionRequest(msg) {
	enqueuePermissionRequest(msg);
}

function handlePermission(msg) {
	addSystemMessage("system", "Permission", formatPermissionResult(msg));
}

function handlePlan(msg) {
	if (app.session.loadingHistory) flushUserMessage();
	ingestEvent(msg, { mode: "stream" });
}

function handleDone() {
	finalizeAssistantTurn();
	app.ui.contextCompactPending = false;
	resetStartupSuppression();
	setStatus("ready");
	setBusy(false);
	renderSessions();
	notifyTaskComplete();
	app.connection.wasBusyForNotification = false;
	void loadContributions({ refresh: true });
}

function handleError(msg) {
	handleProjectPathError(msg);
	cancelSessionSwitchAnimation();
	flushMarkdownRender();
	addSystemMessage("error", "Error", msg.message ?? "Unknown error");
	app.ui.contextCompactPending = false;
	setBusy(false);
	app.connection.wasBusyForNotification = false;
	setStatus("ready");
}

export const messageHandlers = {
	sessions: handleSessions,
	models: handleModels,
	commands: handleCommands,
	project: handleProject,
	session: handleSession,
	history: handleHistory,
	clear: handleClear,
	context: handleContext,
	status: handleStatus,
	user: handleUser,
	user_chunk: handleUserChunk,
	chunk: handleChunk,
	thought: handleThought,
	tool: handleTool,
	permission_request: handlePermissionRequest,
	permission: handlePermission,
	plan: handlePlan,
	done: handleDone,
	error: handleError,
};

export function dispatchMessage(msg) {
	const handler = messageHandlers[msg.type];
	if (handler) handler(msg);
}
