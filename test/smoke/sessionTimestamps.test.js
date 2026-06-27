import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
	timestampFromSessionFilename,
	updatedAtFromJsonl,
	enrichSessionsWithTimestamps,
} from "../../src/sessions/sessionTimestamps.js";

test("timestampFromSessionFilename parses pi session file names", () => {
	const ts = timestampFromSessionFilename(
		"C:/Users/x/.pi/agent/sessions/proj/2026-06-27T02-39-04-314Z_019f06f1.jsonl",
	);
	assert.equal(ts, "2026-06-27T02:39:04.314Z");
});

test("updatedAtFromJsonl returns the latest timestamp in the file", () => {
	const content = [
		'{"type":"session","id":"s1","timestamp":"2026-06-25T10:00:00.000Z","cwd":"/tmp"}',
		'{"type":"message","timestamp":"2026-06-26T12:00:00.000Z","message":{"role":"user","content":"hi"}}',
		'{"type":"message","timestamp":"2026-06-27T08:30:00.000Z","message":{"role":"assistant","content":"hello"}}',
	].join("\n");

	assert.equal(updatedAtFromJsonl(content), "2026-06-27T08:30:00.000Z");
});

test("enrichSessionsWithTimestamps prefers file activity over session.updatedAt", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-web-session-ts-"));
	try {
		const filePath = join(dir, "2026-06-25T10-00-00-000Z_test-session.jsonl");
		await writeFile(
			filePath,
			'{"type":"message","timestamp":"2026-06-26T12:00:00.000Z","message":{"role":"user","content":"hi"}}\n',
			"utf8",
		);

		const sessions = [
			{
				sessionId: "test-session",
				title: "Test",
				updatedAt: "2026-06-27T23:59:59.000Z",
			},
		];
		const fileIndex = new Map([["test-session", filePath]]);
		const enriched = await enrichSessionsWithTimestamps(sessions, fileIndex);

		assert.equal(enriched[0].updatedAt, "2026-06-26T12:00:00.000Z");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
