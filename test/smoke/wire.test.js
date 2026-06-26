import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
	createStartupInfoFilter,
	createToolCallTracker,
	parseSessionJsonl,
	updateToWireEvents,
} from "../../src/wire/acpEvents.js";
import { MAX_WIRE_CHARS, truncateWire } from "../../src/wire/send.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "..", "fixtures", "session-sample.jsonl");

describe("truncateWire", () => {
	it("truncates long strings at MAX_WIRE_CHARS with ellipsis", () => {
		const long = "x".repeat(MAX_WIRE_CHARS + 100);
		const result = truncateWire(long);
		assert.equal(result.length, MAX_WIRE_CHARS + 1);
		assert.ok(result.endsWith("…"));
		assert.equal(result.slice(0, MAX_WIRE_CHARS), "x".repeat(MAX_WIRE_CHARS));
	});

	it("passes short strings through unchanged", () => {
		assert.equal(truncateWire("hello"), "hello");
	});

	it("truncates large objects with a preview", () => {
		const big = { data: "y".repeat(MAX_WIRE_CHARS + 50) };
		const result = truncateWire(big);
		assert.equal(result.truncated, true);
		assert.ok(typeof result.preview === "string");
		assert.ok(result.preview.length <= MAX_WIRE_CHARS + 1);
		assert.ok(result.preview.endsWith("…"));
	});

	it("passes small objects through unchanged", () => {
		const small = { ok: true };
		assert.deepEqual(truncateWire(small), small);
	});
});

describe("createStartupInfoFilter", () => {
	it("filters text containing ## Skills and ## Extensions", () => {
		const filter = createStartupInfoFilter();
		const startup = "## Skills\n- foo\n## Extensions\n- bar";
		assert.equal(filter.filter(startup), null);
		assert.equal(filter.filter("more noise"), "more noise");
	});

	it("passes normal text through", () => {
		const filter = createStartupInfoFilter();
		assert.equal(filter.filter("Hello from the agent."), "Hello from the agent.");
	});
});

describe("createToolCallTracker", () => {
	it("merges updates and resolves tool names", () => {
		const tracker = createToolCallTracker();

		const first = tracker.merge({
			toolCallId: "call-1",
			title: "mcp_ffgrep",
			rawInput: { pattern: "wire" },
		});
		assert.equal(first.id, "call-1");
		assert.equal(first.name, "grep");

		const second = tracker.merge({
			toolCallId: "call-2",
			kind: "bash",
		});
		assert.equal(second.name, "shell");

		const merged = tracker.merge({
			toolCallId: "call-1",
			rawOutput: "src/wire/send.js",
			status: "completed",
		});
		assert.equal(merged.name, "grep");
		assert.equal(merged.state.rawOutput, "src/wire/send.js");
		assert.equal(merged.state.rawInput.pattern, "wire");
	});
});

describe("parseSessionJsonl", () => {
	it("reads fixture and returns chunk, user_chunk, and tool events", async () => {
		const content = await readFile(fixturePath, "utf8");
		const events = parseSessionJsonl(content);

		const userChunks = events.filter((e) => e.type === "user_chunk");
		const chunks = events.filter((e) => e.type === "chunk");
		const tools = events.filter((e) => e.type === "tool");

		assert.equal(userChunks.length, 1);
		assert.equal(userChunks[0].text, "Hello Pi");
		assert.equal(userChunks[0].messageId, "msg-user-1");

		assert.equal(chunks.length, 1);
		assert.equal(chunks[0].text, "Let me search the codebase.");

		assert.ok(tools.length >= 2);
		const toolStart = tools.find((e) => e.event === "start" && e.id === "call-grep-1");
		assert.ok(toolStart);
		assert.equal(toolStart.toolName, "grep");
		assert.equal(toolStart.rawInput.pattern, "wire");

		const toolUpdate = tools.find((e) => e.event === "update" && e.id === "call-grep-1");
		assert.ok(toolUpdate);
		assert.equal(toolUpdate.status, "completed");
		assert.equal(toolUpdate.rawOutput, "src/wire/send.js\nsrc/wire/acpEvents.js");
	});
});

describe("updateToWireEvents", () => {
	it("maps agent_message_chunk to chunk events", () => {
		const events = updateToWireEvents({
			sessionUpdate: "agent_message_chunk",
			content: { type: "text", text: "Streaming reply" },
		});
		assert.deepEqual(events, [{ type: "chunk", text: "Streaming reply" }]);
	});

	it("maps tool_call to tool start events", () => {
		const tracker = createToolCallTracker();
		const events = updateToWireEvents(
			{
				sessionUpdate: "tool_call",
				toolCallId: "live-call-1",
				title: "mcp_ffgrep",
				status: "pending",
				kind: "search",
				rawInput: { pattern: "test" },
			},
			tracker,
		);

		assert.equal(events.length, 1);
		assert.equal(events[0].type, "tool");
		assert.equal(events[0].event, "start");
		assert.equal(events[0].id, "live-call-1");
		assert.equal(events[0].toolName, "grep");
		assert.equal(events[0].title, "grep");
		assert.deepEqual(events[0].rawInput, { pattern: "test" });
	});
});
