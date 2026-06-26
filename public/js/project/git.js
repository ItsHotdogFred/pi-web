import { app } from "../state/store.js";
import { basename } from "../utils/format.js";
import {
	$,
	projectNameEl,
	branchNameEl,
} from "../dom/elements.js";
import { setProjectName, renderProjectMenu } from "./menu.js";

export async function fetchGitInfo(projectPath = app.cwd) {
	try {
		const query = projectPath ? `?cwd=${encodeURIComponent(projectPath)}` : "";
		const res = await fetch(`/api/git${query}`);
		if (res.ok) {
			app.gitInfo = await res.json();
			if (app.gitInfo.path) setProjectName(app.gitInfo.path);
		}
	} catch {
		// keep defaults
	}
	syncGitContext();
	renderProjectMenu();
}

export function syncGitContext() {
	const name = app.gitInfo.project || basename(app.cwd);
	projectNameEl.textContent = name;
	$("project-trigger")?.setAttribute("title", app.cwd || app.gitInfo.path || name);
	branchNameEl.textContent = app.gitInfo.branch || "master";
}
