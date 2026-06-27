import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

import { createAppServer } from "../../src/server/createServer.js";

let server;
let baseUrl;

before(async () => {
	const app = createAppServer();
	server = app.server;
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address();
	baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
	await new Promise((resolve, reject) => {
		server.close((err) => (err ? reject(err) : resolve()));
	});
});

describe("HTTP smoke", () => {
	test("GET /health returns 200 JSON", async () => {
		const res = await fetch(`${baseUrl}/health`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /application\/json/);
		const body = await res.json();
		assert.equal(body.ok, true);
	});

	test("GET /skeleton-dashboard.css returns 200", async () => {
		const res = await fetch(`${baseUrl}/skeleton-dashboard.css`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /text\/css/);
	});

	test("GET / returns 200 HTML", async () => {
		const res = await fetch(`${baseUrl}/`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /text\/html/);
	});

	test("GET /app.js returns 200", async () => {
		const res = await fetch(`${baseUrl}/app.js`);
		assert.equal(res.status, 200);
	});

	test("GET /style.css returns 200", async () => {
		const res = await fetch(`${baseUrl}/style.css`);
		assert.equal(res.status, 200);
	});

	test("GET /marked.min.js returns 200", async () => {
		const res = await fetch(`${baseUrl}/marked.min.js`);
		assert.equal(res.status, 200);
	});

	test("GET /mermaid.min.js returns 200", async () => {
		const res = await fetch(`${baseUrl}/mermaid.min.js`);
		assert.equal(res.status, 200);
	});

	test("GET /api/git returns 200 JSON with git keys", async () => {
		const res = await fetch(`${baseUrl}/api/git`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /application\/json/);
		const body = await res.json();
		assert.equal(typeof body.path, "string");
		assert.equal(typeof body.project, "string");
		assert.equal(typeof body.branch, "string");
		assert.ok(Array.isArray(body.branches));
	});

	test("GET /api/contributions returns 200 JSON with contribution keys", async () => {
		const res = await fetch(`${baseUrl}/api/contributions`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /application\/json/);
		const body = await res.json();
		assert.equal(typeof body.days, "object");
		assert.equal(typeof body.total, "number");
		assert.equal(typeof body.start, "string");
		assert.equal(typeof body.end, "string");
		assert.equal(typeof body.cwd, "string");
	});

	test("GET /api/note returns 200 JSON with note keys", async () => {
		const res = await fetch(`${baseUrl}/api/note`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /application\/json/);
		const body = await res.json();
		assert.equal(typeof body.content, "string");
		assert.equal(typeof body.path, "string");
		assert.equal(typeof body.exists, "boolean");
		assert.equal(typeof body.cwd, "string");
	});

	test("GET /api/files returns 200 JSON with file entries", async () => {
		const res = await fetch(`${baseUrl}/api/files`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get("content-type") ?? "", /application\/json/);
		const body = await res.json();
		assert.equal(typeof body.cwd, "string");
		assert.ok(Array.isArray(body.files));
		if (body.files.length > 0) {
			assert.equal(typeof body.files[0].path, "string");
			assert.ok(body.files[0].type === "file" || body.files[0].type === "dir");
		}
	});

	test("PUT /api/note saves and GET returns updated content", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-web-note-api-"));
		try {
			const encoded = encodeURIComponent(dir);
			const putRes = await fetch(`${baseUrl}/api/note?cwd=${encoded}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content: "smoke test note\n" }),
			});
			assert.equal(putRes.status, 200);
			const putBody = await putRes.json();
			assert.equal(putBody.content, "smoke test note\n");
			assert.equal(putBody.exists, true);

			const getRes = await fetch(`${baseUrl}/api/note?cwd=${encoded}`);
			assert.equal(getRes.status, 200);
			const getBody = await getRes.json();
			assert.equal(getBody.content, "smoke test note\n");
			assert.equal(getBody.exists, true);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	test("GET /api/git?cwd=NOT_A_REAL_PATH returns 400 with message", async () => {
		const res = await fetch(`${baseUrl}/api/git?cwd=NOT_A_REAL_PATH`);
		assert.equal(res.status, 400);
		const body = await res.json();
		assert.equal(typeof body.message, "string");
		assert.ok(body.message.length > 0);
	});

	test("path traversal outside public returns 403", async () => {
		const res = await fetch(`${baseUrl}/%2e%2e%2fpackage.json`);
		assert.equal(res.status, 403);
	});
});
