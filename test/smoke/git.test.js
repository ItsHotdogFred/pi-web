import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { getGitInfo, resolveProjectPath } from "../../src/projects/git.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("resolveProjectPath throws on empty or missing input", async () => {
	await assert.rejects(() => resolveProjectPath(""), /Project path is required/);
	await assert.rejects(() => resolveProjectPath("   "), /Project path is required/);
	await assert.rejects(() => resolveProjectPath(null), /Project path is required/);
	await assert.rejects(() => resolveProjectPath(undefined), /Project path is required/);
});

test("resolveProjectPath throws when path is a file, not a directory", async () => {
	const filePath = join(REPO_ROOT, "package.json");
	await assert.rejects(() => resolveProjectPath(filePath), /must be a directory/);
});

test("resolveProjectPath resolves a valid directory", async () => {
	const resolved = await resolveProjectPath(REPO_ROOT);
	assert.equal(resolved, join(REPO_ROOT));
});

test("getGitInfo returns path, project name, branch, and branches", async () => {
	const info = await getGitInfo(REPO_ROOT);

	assert.equal(info.path, REPO_ROOT);
	assert.equal(info.project, "pi-web");
	assert.equal(typeof info.branch, "string");
	assert.ok(info.branch.length > 0);
	assert.ok(Array.isArray(info.branches));
	assert.ok(info.branches.length > 0);
	assert.ok(info.branches.every((branch) => typeof branch === "string"));
});
