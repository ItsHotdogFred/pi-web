import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { marked } from "marked";
import { readFile } from "node:fs/promises";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/session-sample.jsonl");

function makeSyntheticEvents(turnCount) {
	const events = [];
	for (let i = 0; i < turnCount; i++) {
		events.push({ type: "user_chunk", messageId: `u-${i}`, text: `Question ${i}: explain module ${i % 7}` });
		events.push({
			type: "chunk",
			text: `# Answer ${i}\n\nHere is a **markdown** response with \`code\` and a list:\n\n- item one\n- item two\n- item three\n\n\`\`\`js\nconsole.log(${i});\n\`\`\``,
		});
		if (i % 3 === 0) {
			events.push({
				type: "tool",
				toolCallId: `tool-${i}`,
				name: "grep",
				status: "completed",
				rawOutput: "src/wire/send.js\nsrc/wire/acpEvents.js",
			});
		}
	}
	return events;
}

function installChatDom() {
	const dom = new JSDOM(
		`<!DOCTYPE html><html><body>
			<div id="chat-area"><div id="messages"></div></div>
			<div id="prompt-history-list"></div>
			<textarea id="chat-input"></textarea>
			<textarea id="input"></textarea>
		</body></html>`,
		{ url: "http://localhost/" },
	);
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.location = dom.window.location;
	globalThis.DOMParser = dom.window.DOMParser;
	globalThis.Node = dom.window.Node;
	globalThis.window.marked = marked;
	return dom;
}

test("applyHistoryBatch render time scales with event count", async (t) => {
	const dom = installChatDom();
	const { applyHistoryBatch } = await import("../../public/js/chat/history.js");

	const counts = [10, 50, 100];
	for (const turns of counts) {
		dom.window.document.getElementById("messages").replaceChildren();
		const events = makeSyntheticEvents(turns);
		const start = performance.now();
		applyHistoryBatch(events);
		const ms = Math.round(performance.now() - start);
		const nodeCount = dom.window.document.getElementById("messages").childElementCount;
		t.diagnostic(`applyHistoryBatch: ${turns} turns (${events.length} events) → ${ms}ms, ${nodeCount} DOM nodes`);
	}

	dom.window.close();
	assert.ok(true);
});

test("parseSessionJsonl on fixture", async (t) => {
	const { parseSessionJsonl } = await import("../../src/wire/acpEvents.js");
	const content = readFileSync(FIXTURE, "utf8");

	const start = performance.now();
	const events = parseSessionJsonl(content);
	const ms = Math.round(performance.now() - start);

	t.diagnostic(`parseSessionJsonl fixture: ${events.length} events in ${ms}ms`);
	assert.ok(events.length > 0);
});

test("applyHistoryBatch on largest local session file", async (t) => {
	const { getSessionFileIndex } = await import("../../src/sessions/sessionFiles.js");
	const { parseSessionJsonl } = await import("../../src/wire/acpEvents.js");
	const { DEFAULT_CWD } = await import("../../src/config.js");

	const index = await getSessionFileIndex(DEFAULT_CWD);
	let largestPath = "";
	let largestBytes = 0;
	for (const [, filePath] of index) {
		const content = await readFile(filePath);
		if (content.length > largestBytes) {
			largestBytes = content.length;
			largestPath = filePath;
		}
	}
	if (!largestPath) {
		t.skip("no session files found");
		return;
	}

	const events = parseSessionJsonl(await readFile(largestPath, "utf8"));
	const dom = installChatDom();
	const { applyHistoryBatch } = await import("../../public/js/chat/history.js");

	const start = performance.now();
	applyHistoryBatch(events);
	const ms = Math.round(performance.now() - start);
	const nodes = dom.window.document.getElementById("messages").childElementCount;

	t.diagnostic(
		`largest session (${Math.round(largestBytes / 1024)}KB, ${events.length} events): applyHistoryBatch ${ms}ms → ${nodes} nodes`,
	);
	dom.window.close();
	assert.ok(events.length > 0);
});
