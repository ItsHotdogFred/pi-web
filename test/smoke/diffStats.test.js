import assert from "node:assert/strict";
import { test } from "node:test";

import {
	countDiffLines,
	diffFromToolInput,
	extractDiffFromToolResult,
	statsFromJsonlContent,
} from "../../src/sessions/diffStats.js";

test("countDiffLines counts added and removed lines excluding headers", () => {
	const diff = [
		"--- a/file.js",
		"+++ b/file.js",
		"@@ -1,2 +1,3 @@",
		" context",
		"-removed",
		"+added",
		"+another",
	].join("\n");

	assert.deepEqual(countDiffLines(diff), { linesAdded: 2, linesRemoved: 1 });
});

test("countDiffLines returns zeros for empty input", () => {
	assert.deepEqual(countDiffLines(""), { linesAdded: 0, linesRemoved: 0 });
	assert.deepEqual(countDiffLines(null), { linesAdded: 0, linesRemoved: 0 });
});

test("diffFromToolInput builds edit diff from old/new strings", () => {
	const diff = diffFromToolInput("edit", {
		path: "src/app.js",
		old_string: "foo",
		new_string: "bar",
	});
	assert.ok(diff);
	const stats = countDiffLines(diff);
	assert.equal(stats.linesAdded, 1);
	assert.equal(stats.linesRemoved, 1);
});

test("diffFromToolInput builds write diff for create tool", () => {
	const diff = diffFromToolInput("create", {
		path: "new.txt",
		content: "line one\nline two",
	});
	assert.ok(diff);
	assert.deepEqual(countDiffLines(diff), { linesAdded: 2, linesRemoved: 0 });
});

test("extractDiffFromToolResult reads diff from parsed tool output", () => {
	const message = {
		role: "toolResult",
		toolName: "edit",
		content: [{ type: "text", text: JSON.stringify({ diff: "--- a/x\n+++ b/x\n-old\n+new" }) }],
	};
	const diff = extractDiffFromToolResult(message);
	assert.ok(diff);
	assert.deepEqual(countDiffLines(diff), { linesAdded: 1, linesRemoved: 1 });
});

test("extractDiffFromToolResult accepts raw unified diff text", () => {
	const message = {
		role: "toolResult",
		toolName: "write",
		content: [{ type: "text", text: "--- /dev/null\n+++ b/x\n+hello" }],
	};
	const diff = extractDiffFromToolResult(message);
	assert.ok(diff);
	assert.deepEqual(countDiffLines(diff), { linesAdded: 1, linesRemoved: 0 });
});

test("statsFromJsonlContent aggregates edit and write tool calls", () => {
	const jsonl = [
		'{"type":"session","id":"s1","cwd":"/tmp/p"}',
		'{"type":"message","message":{"role":"assistant","content":[{"type":"toolCall","name":"edit","arguments":{"path":"a.js","old_string":"x","new_string":"y"}}]}}',
		'{"type":"message","message":{"role":"assistant","content":[{"type":"toolCall","name":"write","arguments":{"path":"b.js","content":"one\\ntwo"}}]}}',
	].join("\n");

	assert.deepEqual(statsFromJsonlContent(jsonl), { linesAdded: 3, linesRemoved: 1 });
});

test("statsFromJsonlContent skips malformed lines", () => {
	const jsonl = ["not json", "", '{"type":"message","message":{"role":"user","content":"hi"}}'].join("\n");
	assert.deepEqual(statsFromJsonlContent(jsonl), { linesAdded: 0, linesRemoved: 0 });
});
