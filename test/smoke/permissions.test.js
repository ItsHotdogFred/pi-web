import assert from "node:assert/strict";
import { test } from "node:test";

import {
	cancelAllPendingPermissions,
	resolvePermissionResponse,
} from "../../src/ws/session/permissions.js";

function createMockWs() {
	const sent = [];
	const ws = {
		OPEN: 1,
		readyState: 1,
		sent,
		send(data) {
			sent.push(JSON.parse(data));
		},
	};
	return ws;
}

function createSession(ws = createMockWs()) {
	return {
		ws,
		pendingPermissions: new Map(),
	};
}

function addPendingPermission(session, requestId, { options, tool = { title: "Read file" } } = {}) {
	let outcome;
	const promise = new Promise((resolve) => {
		outcome = resolve;
	});
	const timeout = setTimeout(() => {}, 60_000);
	session.pendingPermissions.set(requestId, {
		resolve: outcome,
		timeout,
		tool,
		options,
	});
	return promise;
}

test("resolvePermissionResponse returns false for unknown requestId", () => {
	const session = createSession();
	const resolved = resolvePermissionResponse(session, "missing-id", { optionId: "allow" });
	assert.equal(resolved, false);
});

test("resolvePermissionResponse selects option and sends permission wire message", async () => {
	const ws = createMockWs();
	const session = createSession(ws);
	const requestId = "req-1";
	const options = [
		{ optionId: "allow-once", kind: "allow_once", name: "Allow once" },
		{ optionId: "deny", kind: "reject_once", name: "Deny" },
	];
	const outcomePromise = addPendingPermission(session, requestId, { options });

	const resolved = resolvePermissionResponse(session, requestId, { optionId: "allow-once" });
	assert.equal(resolved, true);
	assert.equal(session.pendingPermissions.size, 0);
	assert.equal(ws.sent.length, 1);
	assert.deepEqual(ws.sent[0], {
		type: "permission",
		tool: "Read file",
		choice: "Allow once",
		optionId: "allow-once",
	});

	const outcome = await outcomePromise;
	assert.deepEqual(outcome, {
		outcome: { outcome: "selected", optionId: "allow-once" },
	});
});

test("resolvePermissionResponse cancelled resolves cancelled outcome", async () => {
	const session = createSession();
	const requestId = "req-cancel";
	const options = [{ optionId: "allow-once", kind: "allow_once" }];
	const outcomePromise = addPendingPermission(session, requestId, { options });

	const resolved = resolvePermissionResponse(session, requestId, { cancelled: true });
	assert.equal(resolved, true);
	assert.equal(session.pendingPermissions.size, 0);

	const outcome = await outcomePromise;
	assert.deepEqual(outcome, { outcome: { outcome: "cancelled" } });
});

test("cancelAllPendingPermissions clears and cancels all pending", async () => {
	const session = createSession();
	const first = addPendingPermission(session, "req-a", {
		options: [{ optionId: "a", kind: "allow_once" }],
	});
	const second = addPendingPermission(session, "req-b", {
		options: [{ optionId: "b", kind: "allow_once" }],
	});

	cancelAllPendingPermissions(session);

	assert.equal(session.pendingPermissions.size, 0);
	assert.deepEqual(await first, { outcome: { outcome: "cancelled" } });
	assert.deepEqual(await second, { outcome: { outcome: "cancelled" } });
});
