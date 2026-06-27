import { existsSync } from "node:fs";
import { open, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { DEFAULT_CWD } from "../config.js";

export function getPiAgentDir() {
	return process.env.PI_CODING_AGENT_DIR
		? resolve(process.env.PI_CODING_AGENT_DIR)
		: join(homedir(), ".pi", "agent");
}

async function getPiSessionsDir() {
	const agentDir = getPiAgentDir();
	const settingsPath = join(agentDir, "settings.json");
	try {
		const data = JSON.parse(await readFile(settingsPath, "utf8"));
		const sessionDir = data?.sessionDir;
		if (typeof sessionDir === "string" && sessionDir.trim()) {
			return isAbsolute(sessionDir) ? sessionDir : resolve(agentDir, sessionDir);
		}
	} catch {
		// ignore missing settings
	}
	return join(agentDir, "sessions");
}

async function walkJsonlFiles(dir, out) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const filePath = join(dir, entry.name);
		if (entry.isDirectory()) await walkJsonlFiles(filePath, out);
		else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(filePath);
	}
}

export function parseSessionHeader(firstLine) {
	try {
		const obj = JSON.parse(firstLine);
		if (obj?.type !== "session") return null;
		const sessionId = typeof obj?.id === "string" ? obj.id : null;
		const cwd = typeof obj?.cwd === "string" ? obj.cwd : null;
		if (!sessionId || !cwd) return null;
		return { sessionId, cwd };
	} catch {
		return null;
	}
}

async function buildSessionFileIndex(cwd) {
	const index = new Map();
	const files = [];
	await walkJsonlFiles(await getPiSessionsDir(), files);
	await Promise.all(
		files.map(async (file) => {
			try {
				const handle = await open(file, "r");
				const buf = Buffer.alloc(4096);
				const { bytesRead } = await handle.read(buf, 0, 4096, 0);
				await handle.close();
				const firstLine = buf.subarray(0, bytesRead).toString("utf8").split("\n")[0]?.trim();
				const header = parseSessionHeader(firstLine);
				if (header?.cwd && resolve(header.cwd) === resolve(cwd)) index.set(header.sessionId, file);
			} catch {
				// ignore unreadable files
			}
		}),
	);
	return index;
}

const SESSION_INDEX_TTL_MS = 30_000;
const sessionFileIndexCache = new Map();

export async function getSessionFileIndex(cwd, { bust = false } = {}) {
	const resolved = resolve(cwd || DEFAULT_CWD);
	if (!bust) {
		const cached = sessionFileIndexCache.get(resolved);
		if (cached && Date.now() - cached.at < SESSION_INDEX_TTL_MS) {
			return cached.index;
		}
	}
	const index = await buildSessionFileIndex(resolved);
	sessionFileIndexCache.set(resolved, { index, at: Date.now() });
	return index;
}

export function invalidateSessionFileIndex(cwd) {
	if (cwd) sessionFileIndexCache.delete(resolve(cwd));
	else sessionFileIndexCache.clear();
}

export function hasPiAgentPackage(dir) {
	return existsSync(join(dir, "package.json"));
}
