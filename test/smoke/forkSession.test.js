import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { forkSession } from "../../src/sessions/forkSession.js";
import { getSessionFileIndex, invalidateSessionFileIndex } from "../../src/sessions/sessionFiles.js";

const fixture = [
	'{"type":"session","version":3,"id":"source-session","timestamp":"2024-01-01T00:00:00.000Z","cwd":"/tmp/test-project"}',
	'{"type":"message","id":"u1","parentId":null,"timestamp":"2024-01-01T00:01:00.000Z","message":{"role":"user","content":[{"type":"text","text":"First prompt"}]}}',
	'{"type":"message","id":"a1","parentId":"u1","timestamp":"2024-01-01T00:02:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"First reply"}]}}',
	'{"type":"message","id":"u2","parentId":"a1","timestamp":"2024-01-01T00:03:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Second prompt"}]}}',
	'{"type":"message","id":"a2","parentId":"u2","timestamp":"2024-01-01T00:04:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Second reply"}]}}',
].join("\n");

describe("forkSession", () => {
	let agentDir;
	let sessionsDir;
	let previousAgentDir;

	before(async () => {
		agentDir = await mkdtemp(join(tmpdir(), "pi-web-fork-"));
		sessionsDir = join(agentDir, "sessions", "--tmp-test-project--");
		await mkdir(sessionsDir, { recursive: true });
		await writeFile(join(sessionsDir, "2024-01-01T00-00-00-000Z_source-session.jsonl"), `${fixture}\n`, "utf8");
		previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = agentDir;
		invalidateSessionFileIndex("/tmp/test-project");
	});

	after(async () => {
		process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(agentDir, { recursive: true, force: true });
	});

	it("creates a truncated session through the full turn for the chosen prompt", async () => {
		const { sessionId, title } = await forkSession({
			cwd: "/tmp/test-project",
			sourceSessionId: "source-session",
			promptIndex: 2,
		});

		assert.match(title, /^Fork · /);
		assert.ok(sessionId);
		assert.notEqual(sessionId, "source-session");

		const index = await getSessionFileIndex("/tmp/test-project", { bust: true });
		const forkPath = index.get(sessionId);
		assert.ok(forkPath);

		const content = await readFile(forkPath, "utf8");
		const lines = content.trim().split("\n").map((line) => JSON.parse(line));
		assert.equal(lines[0].type, "session");
		assert.equal(lines[0].id, sessionId);
		assert.equal(lines[0].parentSession, join(sessionsDir, "2024-01-01T00-00-00-000Z_source-session.jsonl"));

		const messages = lines.filter((line) => line.type === "message");
		assert.deepEqual(
			messages.map((line) => line.message.content[0].text),
			["First prompt", "First reply", "Second prompt", "Second reply"],
		);
		assert.equal(messages.at(-1)?.message?.role, "assistant");
	});
});
