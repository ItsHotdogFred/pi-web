import assert from "node:assert/strict";
import { test } from "node:test";

import {
	timestampFromSessionFilename,
	updatedAtFromJsonl,
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
