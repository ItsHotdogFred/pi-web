import { DEFAULT_CWD } from "../config.js";
import { getContributions } from "../analytics/contributions.js";
import { getGitInfo, resolveProjectPath } from "../projects/git.js";
import { readProjectNote, writeProjectNote } from "../projects/note.js";

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

	return false;
}
