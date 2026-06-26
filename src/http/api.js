import { DEFAULT_CWD } from "../config.js";
import { getContributions } from "../analytics/contributions.js";
import { getGitInfo, resolveProjectPath } from "../projects/git.js";

function writeJson(res, status, payload) {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
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

export async function handleApiRequest(pathname, req, res) {
	if (pathname === "/api/git") {
		await serveGitInfo(req, res);
		return true;
	}

	if (pathname === "/api/contributions") {
		await serveContributions(req, res);
		return true;
	}

	return false;
}
