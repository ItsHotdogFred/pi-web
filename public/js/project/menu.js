import { app } from "../state/store.js";
import { RECENT_PROJECTS_KEY } from "../config.js";
import { $ } from "../dom/elements.js";
import { basename, escapeHtml } from "../utils/format.js";
import { clearChat } from "../chat/messages.js";
import { showView } from "../ui/views.js";
import { renderModelMenu } from "../ui/models.js";
import { renderSessions } from "../dashboard/sessions.js";
import { resetContextUsage } from "../context/dial.js";
import { syncGitContext } from "./git.js";
import { loadContributions } from "../dashboard/contributions.js";
import { reloadProjectNoteIfOpen } from "./note.js";
import { closeAllDropdowns } from "../ui/dropdowns.js";
import { invalidateProjectFiles } from "../composer/references.js";

export function setProjectName(path) {
	app.session.cwd = path || "";
	app.project.gitInfo.project = basename(path);
	app.project.gitInfo.path = path || app.project.gitInfo.path;
	invalidateProjectFiles();
	syncGitContext();
	void loadContributions();
	reloadProjectNoteIfOpen();
}

export function loadRecentProjects() {
	try {
		const stored = JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || "[]");
		return Array.isArray(stored) ? stored.filter((entry) => typeof entry === "string" && entry.trim()) : [];
	} catch {
		return [];
	}
}

export function rememberProject(path) {
	if (!path) return;
	const recent = loadRecentProjects().filter((entry) => entry !== path);
	recent.unshift(path);
	localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent.slice(0, 8)));
}

export function renderProjectMenu() {
	const list = $("project-menu-list");
	const pathInput = $("project-path-input");
	if (!list) return;

	list.replaceChildren();
	clearProjectPathError();
	const recent = loadRecentProjects();
	const current = app.session.cwd || app.project.gitInfo.path;

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
		btn.innerHTML = `<span class="project-menu-name">${escapeHtml(basename(path))}</span><span class="project-menu-path">${escapeHtml(path)}</span>`;
		btn.addEventListener("click", () => chooseProject(path));
		list.appendChild(btn);
	}
}

export function clearProjectPathError() {
	const errorEl = $("project-path-error");
	if (!errorEl) return;
	errorEl.textContent = "";
	errorEl.classList.add("hidden");
}

export function showProjectPathError(message) {
	const errorEl = $("project-path-error");
	if (!errorEl) return;
	errorEl.textContent = message;
	errorEl.classList.remove("hidden");
}

function chooseProject(path) {
	closeAllDropdowns();
	if (!path || path === app.session.cwd) return;
	sendProjectPath(path);
}

export function sendProjectPath(path) {
	const trimmed = path.trim().replace(/^["']|["']$/g, "");
	if (!trimmed) {
		showProjectPathError("Enter an absolute folder path.");
		return;
	}
	if (!app.connection.ws || app.connection.ws.readyState !== WebSocket.OPEN) {
		showProjectPathError("Not connected yet. Wait for Ready, then try again.");
		return;
	}
	if (app.ui.busy) {
		showProjectPathError("Pi is still working. Wait for it to finish, then try again.");
		return;
	}

	clearProjectPathError();
	closeAllDropdowns();
	app.project.pendingPath = trimmed;
	app.connection.ws.send(JSON.stringify({ type: "set_cwd", path: trimmed }));
}

export function reopenProjectMenu() {
	renderProjectMenu();
	$("project-menu")?.classList.remove("hidden");
	$("project-dropdown")?.classList.add("is-open");
}

export function resetForProjectSwitch(nextCwd) {
	app.session.sessionId = null;
	app.session.sessions = [];
	app.project.commands = [];
	app.models.list = [];
	app.models.currentModelId = null;
	app.models.pendingModelSelection = null;
	app.connection.defaultsRequested = false;
	app.connection.projectSwitchPending = true;
	app.session.creatingSession = false;
	app.session.awaitingNewAgentSession = false;
	app.session.freshDashboardSession = false;
	app.session.pendingDashboardPrompt = null;
	app.project.pendingPath = null;
	clearChat();
	showView("dashboard");
	resetContextUsage();
	if (nextCwd) setProjectName(nextCwd);
	renderSessions();
	renderModelMenu();
}
