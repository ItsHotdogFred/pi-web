import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installDom } from "./helpers/dom.js";

installDom();

const {
	isToolCallId,
	stripToolPrefix,
	normalizeToolName,
	mergeToolName,
	resolveToolName,
	isPiStartupDump,
	couldBeStartupPartial,
	formatSubagentToolCall,
} = await import("../../public/js/utils/tools.js");

describe("isToolCallId", () => {
	it("matches tool call id strings", () => {
		assert.equal(isToolCallId("tool_12345678abcdef01"), true);
		assert.equal(isToolCallId("read"), false);
		assert.equal(isToolCallId("tool_short"), false);
	});
});

describe("stripToolPrefix", () => {
	it("strips mcp prefixes", () => {
		assert.equal(stripToolPrefix("mcp_pi_read"), "read");
		assert.equal(stripToolPrefix("mcp_grep"), "grep");
		assert.equal(stripToolPrefix("read"), "read");
		assert.equal(stripToolPrefix(""), "");
	});
});

describe("normalizeToolName", () => {
	it("normalizes and maps friendly names", () => {
		assert.equal(normalizeToolName("mcp_pi_ffgrep"), "grep");
		assert.equal(normalizeToolName("mcp_bash"), "shell");
		assert.equal(normalizeToolName("read"), "read");
		assert.equal(normalizeToolName("tool_12345678abcdef01"), null);
		assert.equal(normalizeToolName(""), null);
	});
});

describe("mergeToolName", () => {
	it("prefers specific names over generic tool", () => {
		assert.equal(mergeToolName("read", "tool"), "read");
		assert.equal(mergeToolName("tool", "grep"), "grep");
		assert.equal(mergeToolName("", "tool"), "tool");
	});
});

describe("resolveToolName", () => {
	it("resolves from title, raw payloads, and kind", () => {
		assert.equal(resolveToolName({ title: "mcp_pi_read" }), "read");
		assert.equal(
			resolveToolName({ rawInput: '{"toolName":"grep"}' }),
			"grep",
		);
		assert.equal(resolveToolName({ kind: "write" }), "write");
		assert.equal(resolveToolName({}), "Tool");
	});
});

describe("isPiStartupDump", () => {
	it("detects startup dump markers", () => {
		const dump = "## Skills\nfoo\n## Extensions\nbar";
		assert.equal(isPiStartupDump(dump), true);
		assert.equal(isPiStartupDump("## Skills only"), false);
	});
});

describe("couldBeStartupPartial", () => {
	it("detects partial startup buffers", () => {
		assert.equal(couldBeStartupPartial("## Skills\n"), true);
		assert.equal(couldBeStartupPartial("## Ext"), true);
		assert.equal(couldBeStartupPartial("hello"), false);
	});
});

describe("formatSubagentToolCall", () => {
	it("formats common tool calls", () => {
		assert.equal(formatSubagentToolCall("read", { path: "src/a.js" }), "read src/a.js");
		assert.equal(
			formatSubagentToolCall("grep", { pattern: "foo", path: "src" }),
			"grep /foo/ in src",
		);
		assert.equal(
			formatSubagentToolCall("bash", { command: "npm test" }),
			"shell npm test",
		);
		const long = "x".repeat(80);
		assert.match(formatSubagentToolCall("custom", { data: long }), /^custom /);
		assert.match(formatSubagentToolCall("custom", { data: long }), /…$/);
	});
});
