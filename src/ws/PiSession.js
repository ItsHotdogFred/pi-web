import { DEFAULT_CWD } from "../config.js";
import { createStartupInfoFilter, createToolCallTracker } from "../wire/acpEvents.js";
import { closeSession, start } from "./session/agentConnection.js";
import { cancel, compactSession, handlePrompt } from "./session/commands.js";
import { fetchAgentDefaults } from "./session/defaults.js";
import { setModel } from "./session/model.js";
import { setProjectPath } from "./session/project.js";
import { resolvePermissionResponse } from "./session/permissions.js";
import { newSession, switchSession } from "./session/lifecycle.js";

export class PiSession {
	constructor(ws) {
		this.ws = ws;
		this.busy = false;
		this.closed = false;
		this.agentProcess = null;
		this.connection = null;
		this.ctx = null;
		this.session = null;
		this.pumpPromise = null;
		this.replayHandler = null;
		this.protocolVersion = null;
		this.pendingModelId = null;
		this.cwd = DEFAULT_CWD;
		this.toolTracker = createToolCallTracker();
		this.startupFilter = createStartupInfoFilter();
		this.cachedNewSession = null;
		this.cachedNewSessionPromise = null;
		this.hiddenSessionIds = new Set();
		this.historyCache = new Map();
		this.historyCachePromises = new Map();
		this.preloadChain = Promise.resolve();
		this.sessionLoadMutex = Promise.resolve();
		this.sessionLoadGeneration = 0;
		this.sessionFileIndex = new Map();
		this.contextRefreshTimer = null;
		this.pendingPermissions = new Map();
		this.defaultsFetched = false;
		this.defaultsFetchPromise = null;
	}

	resolvePermissionResponse(requestId, options) {
		return resolvePermissionResponse(this, requestId, options);
	}

	async start() {
		return start(this);
	}

	async setProjectPath(input) {
		return setProjectPath(this, input);
	}

	async fetchAgentDefaults() {
		return fetchAgentDefaults(this);
	}

	async handlePrompt(text, images = []) {
		return handlePrompt(this, text, images);
	}

	async cancel() {
		return cancel(this);
	}

	async switchSession(sessionId, requestId = null) {
		return switchSession(this, sessionId, requestId);
	}

	async newSession() {
		return newSession(this);
	}

	async compactSession(customInstructions) {
		return compactSession(this, customInstructions);
	}

	async setModel(value) {
		return setModel(this, value);
	}

	async close() {
		return closeSession(this);
	}
}
