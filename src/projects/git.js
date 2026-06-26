import { execFile } from "node:child_process";
import { basename, resolve } from "node:path";
import { access, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function gitBranch(cwd) {
	try {
		const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
		return stdout.trim() || "master";
	} catch {
		return "master";
	}
}

export async function gitBranches(cwd) {
	try {
		const { stdout } = await execFileAsync("git", ["branch", "--format=%(refname:short)"], { cwd });
		const branches = stdout
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		return branches.length ? branches : ["master"];
	} catch {
		return ["master"];
	}
}

export async function resolveProjectPath(input) {
	if (!input || typeof input !== "string") {
		throw new Error("Project path is required");
	}

	const trimmed = input.trim();
	if (!trimmed) {
		throw new Error("Project path is required");
	}

	const resolved = resolve(trimmed);
	const info = await stat(resolved);
	if (!info.isDirectory()) {
		throw new Error("Project path must be a directory");
	}

	await access(resolved);
	return resolved;
}

export async function getGitInfo(cwd) {
	const branch = await gitBranch(cwd);
	const branches = await gitBranches(cwd);
	return {
		path: cwd,
		project: basename(cwd),
		branch,
		branches,
	};
}
