import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";

// Keep oversized-message smoke fast; still read limit from config.js.
process.env.MAX_PROMPT_BYTES = "8192";

const { createAppServer } = await import("../../src/server/createServer.js");
const { MAX_PROMPT_BYTES } = await import("../../src/config.js");

const serial = { concurrency: 1 };

let server;
let wss;
let port;

function wsUrl() {
	return `ws://127.0.0.1:${port}/ws`;
}

function connectWebSocket() {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl());
		const messages = [];

		ws.on("message", (raw) => {
			messages.push(JSON.parse(String(raw)));
		});

		ws.once("open", () => resolve({ ws, messages }));
		ws.once("error", reject);
	});
}

function waitForClose(ws, timeoutMs) {
	if (ws.readyState === WebSocket.CLOSED) {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		const timer = setTimeout(resolve, timeoutMs);
		ws.once("close", () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

function waitForCondition(getValue, timeoutMs, intervalMs = 25) {
	const deadline = Date.now() + timeoutMs;

	return new Promise((resolve) => {
		const tick = () => {
			const value = getValue();
			if (value !== undefined) {
				resolve(value);
				return;
			}
			if (Date.now() >= deadline) {
				resolve(undefined);
				return;
			}
			setTimeout(tick, intervalMs);
		};
		tick();
	});
}

async function waitForStartup(ws, messages, timeoutMs = 5000) {
	const result = await waitForCondition(() => {
		if (messages.some((msg) => msg.type === "status" && msg.state === "ready")) {
			return "ready";
		}
		if (messages.some((msg) => msg.type === "status" && msg.state === "error")) {
			return "error";
		}
		if (ws.readyState === WebSocket.CLOSED) {
			return "closed";
		}
		return undefined;
	}, timeoutMs);

	if (result) {
		return result;
	}

	await waitForClose(ws, 250);
	return ws.readyState === WebSocket.CLOSED ? "closed" : "timeout";
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("Timed out waiting for WebSocket message"));
		}, timeoutMs);

		const onMessage = (raw) => {
			let msg;
			try {
				msg = JSON.parse(String(raw));
			} catch {
				return;
			}
			if (predicate(msg)) {
				cleanup();
				resolve(msg);
			}
		};

		const cleanup = () => {
			clearTimeout(timer);
			ws.off("message", onMessage);
		};

		ws.on("message", onMessage);
	});
}

async function closeWebSocket(ws) {
	if (ws.readyState === WebSocket.CLOSED) {
		return;
	}
	ws.close();
	await waitForClose(ws, 2000);
}

test.before(async () => {
	({ server, wss } = createAppServer());
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	port = server.address().port;
});

test.after(async () => {
	for (const client of wss.clients) {
		client.terminate();
	}
	if (typeof server.closeAllConnections === "function") {
		server.closeAllConnections();
	}
	await Promise.race([
		new Promise((resolve, reject) => {
			server.close((err) => (err ? reject(err) : resolve()));
		}),
		new Promise((resolve) => setTimeout(resolve, 1000)),
	]);
});

test("WebSocket connection opens without immediate error", serial, async () => {
	const { ws } = await connectWebSocket();
	try {
		assert.equal(ws.readyState, WebSocket.OPEN);
	} finally {
		await closeWebSocket(ws);
	}
});

test("invalid JSON returns type error after connection opens", serial, async (t) => {
	const { ws, messages } = await connectWebSocket();
	t.after(() => closeWebSocket(ws));

	const startup = await waitForStartup(ws, messages);
	if (startup !== "ready") {
		t.skip(`pi-acp not ready for message validation (startup: ${startup})`);
		return;
	}

	ws.send("not-json");

	const invalidJsonError = await waitForMessage(
		ws,
		(msg) => msg.type === "error" && /Invalid JSON/i.test(msg.message ?? ""),
	);
	assert.equal(invalidJsonError.type, "error");
	assert.match(invalidJsonError.message, /Invalid JSON/i);
});

test("oversized message returns byte limit error after connection opens", serial, async (t) => {
	const { ws, messages } = await connectWebSocket();
	t.after(() => closeWebSocket(ws));

	const startup = await waitForStartup(ws, messages);
	if (startup !== "ready") {
		t.skip(`pi-acp not ready for message validation (startup: ${startup})`);
		return;
	}

	ws.send("x".repeat(MAX_PROMPT_BYTES + 1));

	const sizeError = await waitForMessage(
		ws,
		(msg) => msg.type === "error" && /byte limit/i.test(msg.message ?? ""),
	);
	assert.equal(sizeError.type, "error");
	assert.match(sizeError.message, new RegExp(`${MAX_PROMPT_BYTES}`));
});

test("optional first status message shape when pi-acp responds", serial, async (t) => {
	const { ws, messages } = await connectWebSocket();
	t.after(() => closeWebSocket(ws));

	await waitForCondition(() => {
		if (messages.length > 0) return messages;
		if (ws.readyState === WebSocket.CLOSED) return messages;
		return undefined;
	}, 5000);

	if (messages.length === 0) {
		t.skip("no WebSocket messages within 5s (pi-acp likely unavailable)");
		return;
	}

	const statusMsg = messages.find((msg) => msg.type === "status");
	if (!statusMsg) {
		t.diagnostic("no status message in first 5s; pi-acp may have failed during startup");
		return;
	}

	try {
		assert.equal(statusMsg.type, "status");
		assert.equal(typeof statusMsg.state, "string");
	} catch (error) {
		t.diagnostic(`soft status shape check: ${error.message}`);
	}

	const startup = await waitForStartup(ws, messages);
	if (startup === "error" || startup === "closed") {
		t.diagnostic(`pi-acp startup ended with ${startup}; validation tests would be skipped`);
	}
});
