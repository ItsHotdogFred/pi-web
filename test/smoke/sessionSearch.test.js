import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { searchSessions } from "../../src/sessions/sessionSearch.js";
import { invalidateSessionFileIndex } from "../../src/sessions/sessionFiles.js";

const FIXTURE_CWD = "/tmp/pi-web-search-test";

const sessionA = [
	'{"type":"session","id":"search-a","cwd":"/tmp/pi-web-search-test"}',
	'{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Fix authentication bug in login flow"}]}}',
	'{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Searching auth module"},{"type":"toolCall","name":"grep","arguments":{"pattern":"login","path":"src/auth"}}]}}',
].join("\n");

const sessionB = [
	'{"type":"session","id":"search-b","cwd":"/tmp/pi-web-search-test"}',
	'{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Add dark mode toggle"}]}}',
	'{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"Updating styles.css"}]}}',
].join("\n");

describe("searchSessions", () => {
	let agentDir;
	let previousAgentDir;

	before(async () => {
		agentDir = await mkdtemp(join(tmpdir(), "pi-web-search-"));
		const sessionsDir = join(agentDir, "sessions", "--tmp-pi-web-search-test--");
		await mkdir(sessionsDir, { recursive: true });
		await writeFile(join(sessionsDir, "2024-01-01T00-00-00-000Z_search-a.jsonl"), `${sessionA}\n`, "utf8");
		await writeFile(join(sessionsDir, "2024-01-01T00-00-00-000Z_search-b.jsonl"), `${sessionB}\n`, "utf8");
		previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = agentDir;
		invalidateSessionFileIndex(FIXTURE_CWD);
	});

	after(async () => {
		process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(agentDir, { recursive: true, force: true });
	});

	it("returns matching sessions ranked by term score", async () => {
		const { results } = await searchSessions(FIXTURE_CWD, "authentication login");

		assert.ok(results.length >= 1);
		assert.equal(results[0].sessionId, "search-a");
		assert.equal(results[0].score, 2);
		assert.ok(results[0].matchCount >= 2);
		assert.ok(results[0].snippet.toLowerCase().includes("authentication") || results[0].snippet.toLowerCase().includes("login"));
		assert.match(results[0].title ?? "", /authentication|login/i);
	});

	it("matches tool names and file paths in tool arguments", async () => {
		const { results } = await searchSessions(FIXTURE_CWD, "grep src/auth");

		assert.ok(results.some((r) => r.sessionId === "search-a"));
		const match = results.find((r) => r.sessionId === "search-a");
		assert.ok(match);
		assert.ok(match.score >= 1);
	});

	it("returns empty results for blank query", async () => {
		const { results } = await searchSessions(FIXTURE_CWD, "   ");
		assert.deepEqual(results, []);
	});

	it("respects limit parameter", async () => {
		const { results } = await searchSessions(FIXTURE_CWD, "the", { limit: 1 });
		assert.equal(results.length, 1);
	});
});
