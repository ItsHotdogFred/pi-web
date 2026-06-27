import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DEFAULT_CWD } from "../config.js";
import { statsFromJsonlContent } from "./diffStats.js";
import { getSessionFileIndex } from "./sessionFiles.js";
import { updatedAtFromJsonl } from "./sessionTimestamps.js";

const SESSION_STATS_TTL_MS = 30_000;
const sessionStatsCache = new Map();

async function scanSessionStats(cwd) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const index = await getSessionFileIndex(resolvedCwd);
	const stats = {};

	await Promise.all(
		[...index.entries()].map(async ([sessionId, filePath]) => {
			try {
				const content = await readFile(filePath, "utf8");
				const { linesAdded, linesRemoved } = statsFromJsonlContent(content);
				stats[sessionId] = {
					linesAdded,
					linesRemoved,
					updatedAt: updatedAtFromJsonl(content),
				};
			} catch {
				stats[sessionId] = { linesAdded: 0, linesRemoved: 0, updatedAt: null };
			}
		}),
	);

	return { stats, cwd: resolvedCwd };
}

export async function getSessionStats(cwd, { bust = false } = {}) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	if (!bust) {
		const cached = sessionStatsCache.get(resolvedCwd);
		if (cached && Date.now() - cached.at < SESSION_STATS_TTL_MS) {
			return cached.data;
		}
	}
	const data = await scanSessionStats(resolvedCwd);
	sessionStatsCache.set(resolvedCwd, { at: Date.now(), data });
	return data;
}

export function invalidateSessionStatsCache(cwd) {
	if (cwd) sessionStatsCache.delete(resolve(cwd));
	else sessionStatsCache.clear();
}
