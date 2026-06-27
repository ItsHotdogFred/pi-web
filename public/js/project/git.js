import { app } from "../state/store.js";
import { basename } from "../utils/format.js";
import {
	$,
	projectNameEl,
	branchNameEl,
} from "../dom/elements.js";
import { setProjectName, renderProjectMenu } from "./menu.js";

export async function fetchGitInfo(projectPath = app.session.cwd) {
	try {
		const query = projectPath ? `?cwd=${encodeURIComponent(projectPath)}` : "";
		const res = await fetch(`/api/git${query}`);
		if (res.ok) {
			app.project.gitInfo = await res.json();
			if (app.project.gitInfo.path) setProjectName(app.project.gitInfo.path);
		}
	} catch {
		// keep defaults
	}
	syncGitContext();
	renderProjectMenu();
}

export function syncGitContext() {
	const name = app.project.gitInfo.project || basename(app.session.cwd);
	projectNameEl.textContent = name;
	$("project-trigger")?.setAttribute("title", app.session.cwd || app.project.gitInfo.path || name);
	branchNameEl.textContent = app.project.gitInfo.branch || "master";
}
