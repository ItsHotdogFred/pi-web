import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
	getPiAgentDir,
	hasPiAgentPackage,
	parseSessionHeader,
} from "../../src/sessions/sessionFiles.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("parseSessionHeader returns sessionId and cwd for a valid session line", () => {
	const line = JSON.stringify({
		type: "session",
		id: "sess-123",
		cwd: "/home/user/project",
	});
	const header = parseSessionHeader(line);

	assert.deepEqual(header, { sessionId: "sess-123", cwd: "/home/user/project" });
});

test("parseSessionHeader returns null for invalid lines", () => {
	assert.equal(parseSessionHeader(""), null);
	assert.equal(parseSessionHeader("not json"), null);
	assert.equal(parseSessionHeader(JSON.stringify({ type: "message" })), null);
	assert.equal(parseSessionHeader(JSON.stringify({ type: "session" })), null);
	assert.equal(parseSessionHeader(JSON.stringify({ type: "session", id: "x" })), null);
});

test("getPiAgentDir returns a string path", () => {
	const dir = getPiAgentDir();
	assert.equal(typeof dir, "string");
	assert.ok(dir.length > 0);
});

test("hasPiAgentPackage detects package.json in repo root", () => {
	assert.equal(hasPiAgentPackage(REPO_ROOT), true);
});

test("hasPiAgentPackage is false for /tmp and nonexistent paths", () => {
	assert.equal(hasPiAgentPackage("/tmp"), false);
	assert.equal(hasPiAgentPackage(join(REPO_ROOT, "__does_not_exist__")), false);
});
