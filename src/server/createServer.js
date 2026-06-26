import { createServer } from "node:http";
import { WebSocketServer } from "ws";

import { handleApiRequest } from "../http/api.js";
import { serveStatic } from "../http/static.js";
import { handleWebSocket } from "../ws/handleWebSocket.js";

async function handleHttpRequest(req, res) {
	const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
	const pathname = decodeURIComponent(url.pathname);

	if (await handleApiRequest(pathname, req, res)) return;
	await serveStatic(req, res, pathname);
}

export function createAppServer() {
	const server = createServer((req, res) => {
		void handleHttpRequest(req, res);
	});
	const wss = new WebSocketServer({ server, path: "/ws" });

	wss.on("connection", (ws) => {
		void handleWebSocket(ws);
	});

	return { server, wss };
}
