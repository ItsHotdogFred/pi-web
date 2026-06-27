import { DEFAULT_CWD } from "../config.js";
import { getContributions } from "../analytics/contributions.js";
import { listProjectFiles } from "../projects/files.js";
import { getGitInfo, resolveProjectPath } from "../projects/git.js";
import { readProjectNote, writeProjectNote } from "../projects/note.js";
import { forkSession } from "../sessions/forkSession.js";
import { invalidateSessionFileIndex } from "../sessions/sessionFiles.js";
import { searchSessions } from "../sessions/sessionSearch.js";
import { getSessionStats } from "../sessions/sessionStats.js";

function writeJson(res, status, payload, extraHeaders = {}) {
	res.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
		...extraHeaders,
	});
	res.end(JSON.stringify(payload));
}

function readRequestBody(req, maxBytes = 1024 * 1024) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > maxBytes) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

export function serveHealth(_req, res) {
	writeJson(res, 200, { ok: true }, { "Access-Control-Allow-Origin": "*" });
}

export async function serveGitInfo(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const info = await getGitInfo(cwd);
		writeJson(res, 200, info);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function serveContributions(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");
	const bust = url.searchParams.get("refresh") === "1";

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const data = await getContributions(cwd, { bust });
		writeJson(res, 200, data);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function serveProjectFiles(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const files = await listProjectFiles(cwd);
		writeJson(res, 200, { cwd, files });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function serveProjectNote(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;

		if (req.method === "GET") {
			const note = await readProjectNote(cwd);
			writeJson(res, 200, note);
			return;
		}

		if (req.method === "PUT") {
			const raw = await readRequestBody(req);
			let payload;
			try {
				payload = JSON.parse(raw);
			} catch {
				writeJson(res, 400, { message: "Invalid JSON body" });
				return;
			}
			const content = typeof payload?.content === "string" ? payload.content : "";
			const note = await writeProjectNote(cwd, content);
			writeJson(res, 200, note);
			return;
		}

		writeJson(res, 405, { message: "Method not allowed" });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function serveSessionSearch(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");
	const query = url.searchParams.get("q") ?? "";
	const limitParam = url.searchParams.get("limit");
	const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const data = await searchSessions(cwd, query, { limit: Number.isFinite(limit) ? limit : 20 });
		writeJson(res, 200, data);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function serveSessionStats(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const requested = url.searchParams.get("cwd");
	const bust = url.searchParams.get("refresh") === "1";

	try {
		const cwd = requested ? await resolveProjectPath(requested) : DEFAULT_CWD;
		const data = await getSessionStats(cwd, { bust });
		writeJson(res, 200, data);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function serveSessionFork(req, res) {
	if (req.method !== "POST") {
		writeJson(res, 405, { message: "Method not allowed" });
		return;
	}

	try {
		const raw = await readRequestBody(req);
		let payload;
		try {
			payload = JSON.parse(raw);
		} catch {
			writeJson(res, 400, { message: "Invalid JSON body" });
			return;
		}

		const cwd = payload?.cwd ? await resolveProjectPath(payload.cwd) : DEFAULT_CWD;
		const sourceSessionId = payload?.sourceSessionId;
		const promptIndex = payload?.promptIndex;

		if (!sourceSessionId || typeof sourceSessionId !== "string") {
			writeJson(res, 400, { message: "sourceSessionId is required" });
			return;
		}
		if (!Number.isInteger(promptIndex) || promptIndex < 1) {
			writeJson(res, 400, { message: "promptIndex must be a positive integer" });
			return;
		}

		const result = await forkSession({ cwd, sourceSessionId, promptIndex });
		invalidateSessionFileIndex(cwd);
		writeJson(res, 200, result);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		writeJson(res, 400, { message });
	}
}

export async function handleApiRequest(pathname, req, res) {
	if (pathname === "/health") {
		serveHealth(req, res);
		return true;
	}

	if (pathname === "/api/git") {
		await serveGitInfo(req, res);
		return true;
	}

	if (pathname === "/api/contributions") {
		await serveContributions(req, res);
		return true;
	}

	if (pathname === "/api/note") {
		await serveProjectNote(req, res);
		return true;
	}

	if (pathname === "/api/files") {
		await serveProjectFiles(req, res);
		return true;
	}

	if (pathname === "/api/session/fork") {
		await serveSessionFork(req, res);
		return true;
	}

	if (pathname === "/api/sessions/search") {
		await serveSessionSearch(req, res);
		return true;
	}

	if (pathname === "/api/sessions/stats") {
		await serveSessionStats(req, res);
		return true;
	}

	return false;
}
