import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PUBLIC_DIR = join(APP_ROOT, "public");

export const PORT = Number(process.env.PORT || 3847);
export const DEFAULT_CWD = process.env.PI_CWD || process.cwd();

export const PI_ACP_ENTRY = join(APP_ROOT, "node_modules", "pi-acp", "dist", "index.js");
export const PI_ACP_COMMAND = process.env.PI_ACP_COMMAND || process.execPath;
export const PI_ACP_ARGS = process.env.PI_ACP_ARGS
	? process.env.PI_ACP_ARGS.split(" ")
	: [PI_ACP_ENTRY];
export const PI_ACP_SHELL =
	process.env.PI_ACP_SHELL === "1" ||
	(process.env.PI_ACP_SHELL !== "0" && process.platform === "win32" && PI_ACP_COMMAND === "npx");

export const PI_WEB_AUTO_APPROVE = process.env.PI_WEB_AUTO_APPROVE === "1";
export const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

export const MIME = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
};
