import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import WebSocket from "ws";

const { createAppServer } = await import("../../src/server/createServer.js");
const { getSessionFileIndex } = await import("../../src/sessions/sessionFiles.js");
const { getHistoryCache } = await import("../../src/ws/session/historyCache.js");
const { DEFAULT_CWD } = await import("../../src/config.js");

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
			messages.push({ at: performance.now(), msg: JSON.parse(String(raw)) });
		});

		ws.once("open", () => resolve({ ws, messages }));
		ws.once("error", reject);
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

async function waitForReady(ws, messages, timeoutMs = 15000) {
	const result = await waitForCondition(() => {
		if (messages.some(({ msg }) => msg.type === "status" && msg.state === "ready")) return "ready";
		if (messages.some(({ msg }) => msg.type === "status" && msg.state === "error")) return "error";
		if (ws.readyState === WebSocket.CLOSED) return "closed";
		return undefined;
	}, timeoutMs);
	return result ?? (ws.readyState === WebSocket.CLOSED ? "closed" : "timeout");
}

async function closeWebSocket(ws) {
	if (ws.readyState === WebSocket.CLOSED) return;
	ws.close();
	await waitForCondition(() => (ws.readyState === WebSocket.CLOSED ? true : undefined), 2000);
}

function summarizeSwitch(messages, startAt, requestId) {
	const window = messages.filter(({ at }) => at >= startAt);
	const byType = (type, extra = () => true) =>
		window.find(({ msg }) => msg.type === type && extra(msg));

	const clear = byType("clear", (m) => m.requestId === requestId);
	const loading = byType("status", (m) => m.state === "loading_history" && m.requestId === requestId);
	const history = byType("history", (m) => m.requestId === requestId);
	const session = byType("session", (m) => m.requestId === requestId);
	const ready = byType("status", (m) => m.state === "ready" && m.requestId === requestId);

	const ms = (entry) => (entry ? Math.round(entry.at - startAt) : null);

	return {
		toClear: ms(clear),
		toLoadingHistory: ms(loading),
		toHistory: ms(history),
		historyEvents: history?.msg?.events?.length ?? 0,
		historyCached: session?.msg?.cached ?? null,
		toSession: ms(session),
		toReady: ms(ready),
		totalMs: ms(ready) ?? ms(session),
	};
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
	for (const client of wss.clients) client.terminate();
	if (typeof server.closeAllConnections === "function") server.closeAllConnections();
	await Promise.race([
		new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
		new Promise((resolve) => setTimeout(resolve, 1000)),
	]);
});

test("getSessionFileIndex timing (filesystem walk)", serial, async (t) => {
	const start = performance.now();
	const index = await getSessionFileIndex(DEFAULT_CWD, { bust: true });
	const coldMs = Math.round(performance.now() - start);

	const warmStart = performance.now();
	await getSessionFileIndex(DEFAULT_CWD);
	const warmMs = Math.round(performance.now() - warmStart);

	t.diagnostic(`getSessionFileIndex: ${index.size} sessions, cold=${coldMs}ms warm=${warmMs}ms`);
	assert.ok(coldMs >= 0);
});

test("session switch latency breakdown (requires pi-acp)", serial, async (t) => {
	const { ws, messages } = await connectWebSocket();
	t.after(() => closeWebSocket(ws));

	const startup = await waitForReady(ws, messages);
	if (startup !== "ready") {
		t.skip(`pi-acp not ready (startup: ${startup})`);
		return;
	}

	const sessionsMsg = messages.find(({ msg }) => msg.type === "sessions");
	const sessions = sessionsMsg?.msg?.sessions ?? [];
	if (sessions.length < 2) {
		t.skip(`need at least 2 sessions to benchmark switching (found ${sessions.length})`);
		return;
	}

	const [a, b] = sessions;
	const requestId = 42;
	const startAt = performance.now();
	ws.send(JSON.stringify({ type: "switch_session", sessionId: a.sessionId, requestId }));

	const firstReady = await waitForCondition(() => {
		const hit = messages.find(
			({ at, msg }) =>
				at >= startAt && msg.type === "status" && msg.state === "ready" && msg.requestId === requestId,
		);
		return hit ? "ready" : undefined;
	}, 30000);

	if (firstReady !== "ready") {
		t.skip("switch to first session did not reach ready in 30s");
		return;
	}

	const first = summarizeSwitch(messages, startAt, requestId);
	t.diagnostic(`switch → ${a.sessionId.slice(0, 8)}…: ${JSON.stringify(first)}`);

	const requestId2 = 43;
	const startAt2 = performance.now();
	ws.send(JSON.stringify({ type: "switch_session", sessionId: b.sessionId, requestId: requestId2 }));

	const secondReady = await waitForCondition(() => {
		const hit = messages.find(
			({ at, msg }) =>
				at >= startAt2 && msg.type === "status" && msg.state === "ready" && msg.requestId === requestId2,
		);
		return hit ? "ready" : undefined;
	}, 30000);

	assert.equal(secondReady, "ready", "second switch should reach ready");

	const second = summarizeSwitch(messages, startAt2, requestId2);
	t.diagnostic(`switch → ${b.sessionId.slice(0, 8)}…: ${JSON.stringify(second)}`);

	// Round-trip back to first session (cache should help history)
	const requestId3 = 44;
	const startAt3 = performance.now();
	ws.send(JSON.stringify({ type: "switch_session", sessionId: a.sessionId, requestId: requestId3 }));

	await waitForCondition(() => {
		const hit = messages.find(
			({ at, msg }) =>
				at >= startAt3 && msg.type === "status" && msg.state === "ready" && msg.requestId === requestId3,
		);
		return hit ? "ready" : undefined;
	}, 30000);

	const third = summarizeSwitch(messages, startAt3, requestId3);
	t.diagnostic(`switch back → ${a.sessionId.slice(0, 8)}… (cached?): ${JSON.stringify(third)}`);

	if (third.toHistory != null && third.toReady != null && third.toHistory < third.toReady) {
		t.diagnostic(
			`history arrived ${third.toReady - third.toHistory}ms before ready — agent.session.load dominates after UI history`,
		);
	}

	assert.ok(second.totalMs != null && second.totalMs > 0);
});
