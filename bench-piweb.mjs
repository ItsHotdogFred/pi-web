/**
 * End-to-end pi-web session switch benchmark.
 * Run: node bench-piweb.mjs
 */
import { performance } from "node:perf_hooks";
import WebSocket from "ws";
import { createAppServer } from "./src/server/createServer.js";
import { getSessionFileIndex } from "./src/sessions/sessionFiles.js";
import { DEFAULT_CWD } from "./src/config.js";

function waitFor(ms) {
	return new Promise((r) => setTimeout(r, ms));
}

function waitUntil(getValue, timeoutMs = 30_000, intervalMs = 25) {
	const deadline = performance.now() + timeoutMs;
	return new Promise((resolve) => {
		const tick = () => {
			const value = getValue();
			if (value !== undefined) {
				resolve(value);
				return;
			}
			if (performance.now() >= deadline) {
				resolve(undefined);
				return;
			}
			setTimeout(tick, intervalMs);
		};
		tick();
	});
}

function summarizeSwitch(messages, startAt, requestId) {
	const window = messages.filter(({ at }) => at >= startAt);
	const find = (type, pred = () => true) =>
		window.find(({ msg }) => msg.type === type && pred(msg));
	const ms = (entry) => (entry ? Math.round(entry.at - startAt) : null);

	const history = find("history", (m) => m.requestId === requestId);
	const session = find("session", (m) => m.requestId === requestId);
	const ready = find("status", (m) => m.state === "ready" && m.requestId === requestId);

	return {
		toClear: ms(find("clear", (m) => m.requestId === requestId)),
		toHistory: ms(history),
		historyEvents: history?.msg?.events?.length ?? 0,
		historyBytes: history ? JSON.stringify(history.msg).length : 0,
		historyCached: session?.msg?.cached ?? null,
		toSession: ms(session),
		toReady: ms(ready),
		gapHistoryToReady:
			ms(ready) != null && ms(history) != null ? ms(ready) - ms(history) : null,
	};
}

async function runPiWebBenchmark() {
	const { server, wss } = createAppServer();
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const port = server.address().port;
	const url = `ws://127.0.0.1:${port}/ws`;

	const connectStart = performance.now();
	const ws = new WebSocket(url);
	const messages = [];
	ws.on("message", (raw) => {
		messages.push({ at: performance.now(), msg: JSON.parse(String(raw)) });
	});

	await new Promise((resolve, reject) => {
		ws.once("open", resolve);
		ws.once("error", reject);
	});

	const connectOpenMs = Math.round(performance.now() - connectStart);

	const startupState = await waitUntil(() => {
		if (messages.some(({ msg }) => msg.type === "status" && msg.state === "ready")) return "ready";
		if (messages.some(({ msg }) => msg.type === "status" && msg.state === "error")) return "error";
		if (ws.readyState === WebSocket.CLOSED) return "closed";
		return undefined;
	}, 60_000);

	const connectReadyMs = Math.round(
		(messages.find(({ msg }) => msg.type === "status" && msg.state === "ready")?.at ?? performance.now()) -
			connectStart,
	);

	const sessions = messages.find(({ msg }) => msg.type === "sessions")?.msg?.sessions ?? [];
	const index = await getSessionFileIndex(DEFAULT_CWD);

	const switchResults = [];
	if (startupState === "ready" && sessions.length >= 2) {
		const targets = sessions.slice(0, Math.min(4, sessions.length));
		// Ensure we switch between at least two distinct sessions
		const sequence = [...targets];
		if (sequence.length >= 2) sequence.push(sequence[0]);

		let requestId = 100;
		for (const session of sequence) {
			requestId += 1;
			const startAt = performance.now();
			ws.send(
				JSON.stringify({
					type: "switch_session",
					sessionId: session.sessionId,
					requestId,
				}),
			);

			const ok = await waitUntil(() => {
				const hit = messages.find(
					({ at, msg }) =>
						at >= startAt &&
						msg.type === "status" &&
						msg.state === "ready" &&
						msg.requestId === requestId,
				);
				return hit ? true : undefined;
			}, 45_000);

			if (!ok) {
				switchResults.push({
					sessionId: session.sessionId.slice(0, 8),
					error: "timeout",
				});
				continue;
			}

			switchResults.push({
				sessionId: session.sessionId.slice(0, 8),
				title: session.title ?? "(untitled)",
				...summarizeSwitch(messages, startAt, requestId),
			});
		}
	}

	ws.close();
	for (const client of wss.clients) client.terminate();
	await new Promise((resolve) => server.close(() => resolve()));

	const readyTimes = switchResults.filter((r) => r.toReady != null).map((r) => r.toReady);
	const historyTimes = switchResults.filter((r) => r.toHistory != null).map((r) => r.toHistory);
	const gaps = switchResults.filter((r) => r.gapHistoryToReady != null).map((r) => r.gapHistoryToReady);

	const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
	const min = (arr) => (arr.length ? Math.min(...arr) : null);
	const max = (arr) => (arr.length ? Math.max(...arr) : null);

	return {
		cwd: DEFAULT_CWD,
		connectOpenMs,
		connectReadyMs,
		startupState,
		sessionCount: sessions.length,
		indexedSessionFiles: index.size,
		switches: switchResults,
		summary: {
			switchReadyAvgMs: avg(readyTimes),
			switchReadyMinMs: min(readyTimes),
			switchReadyMaxMs: max(readyTimes),
			historyAvgMs: avg(historyTimes),
			gapHistoryToReadyAvgMs: avg(gaps),
		},
	};
}

console.log("pi-web session switch benchmark\n");
console.log(`cwd: ${DEFAULT_CWD}\n`);

const result = await runPiWebBenchmark();

console.log("--- Connection ---");
console.log(`  WebSocket open:     ${result.connectOpenMs} ms`);
console.log(`  First ready:        ${result.connectReadyMs} ms (${result.startupState})`);
console.log(`  Sessions listed:    ${result.sessionCount}`);
console.log(`  Session files:      ${result.indexedSessionFiles}`);

console.log("\n--- Session switches ---");
if (result.switches.length === 0) {
	console.log("  (skipped — need pi-acp ready + 2+ sessions)");
} else {
	for (const s of result.switches) {
		if (s.error) {
			console.log(`  ${s.sessionId}: ${s.error}`);
			continue;
		}
		console.log(
			`  ${s.sessionId}  ready=${s.toReady}ms  history@${s.toHistory}ms (${s.historyEvents} events, cached=${s.historyCached})  gap=${s.gapHistoryToReady}ms`,
		);
	}
	console.log("\n--- Aggregates ---");
	console.log(`  Ready:   avg ${result.summary.switchReadyAvgMs}ms  min ${result.summary.switchReadyMinMs}ms  max ${result.summary.switchReadyMaxMs}ms`);
	console.log(`  History: avg ${result.summary.historyAvgMs}ms`);
	console.log(`  Gap (ready − history): avg ${result.summary.gapHistoryToReadyAvgMs}ms`);
}

console.log("\n(JSON)");
console.log(JSON.stringify(result, null, 2));
