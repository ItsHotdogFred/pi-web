import { extname, join } from "node:path";
import { readFile } from "node:fs/promises";

import { APP_ROOT, MIME, PUBLIC_DIR } from "../config.js";

export async function serveStatic(req, res, pathname) {
	let staticPath = pathname;
	if (staticPath === "/") staticPath = "/index.html";

	if (staticPath === "/marked.min.js") {
		const markedPath = join(APP_ROOT, "node_modules", "marked", "marked.min.js");
		try {
			const body = await readFile(markedPath);
			res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
			res.end(body);
			return;
		} catch {
			res.writeHead(404).end("Not found");
			return;
		}
	}

	const filePath = join(PUBLIC_DIR, staticPath.replace(/^\/+/, ""));
	if (!filePath.startsWith(PUBLIC_DIR)) {
		res.writeHead(403).end("Forbidden");
		return;
	}

	try {
		const body = await readFile(filePath);
		res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
		res.end(body);
	} catch {
		res.writeHead(404).end("Not found");
	}
}
