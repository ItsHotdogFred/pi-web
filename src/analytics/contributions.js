import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DEFAULT_CWD } from "../config.js";
import { getSessionFileIndex } from "../sessions/sessionFiles.js";

function contributionDateKey(value) {
	if (value == null) return null;
	const date = typeof value === "number" ? new Date(value) : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString().slice(0, 10);
}

function countUserMessagesInLine(line, dayCounts) {
	if (!line.trim()) return;
	let row;
	try {
		row = JSON.parse(line);
	} catch {
		return;
	}
	if (row?.type !== "message" || row.message?.role !== "user") return;
	const key = contributionDateKey(row.timestamp ?? row.message?.timestamp);
	if (key && Object.hasOwn(dayCounts, key)) {
		dayCounts[key] += 1;
	}
}

async function scanSessionFileContributions(filePath, dayCounts) {
	try {
		const content = await readFile(filePath, "utf8");
		for (const line of content.split("\n")) {
			countUserMessagesInLine(line, dayCounts);
		}
	} catch {
		// ignore unreadable session files
	}
}

function buildContributionDayRange() {
	const end = new Date();
	end.setHours(0, 0, 0, 0);
	const days = {};
	const keys = [];
	for (let offset = 364; offset >= 0; offset -= 1) {
		const date = new Date(end);
		date.setDate(date.getDate() - offset);
		const key = date.toISOString().slice(0, 10);
		days[key] = 0;
		keys.push(key);
	}
	return { days, start: keys[0], end: keys[keys.length - 1] };
}

const contributionsCache = new Map();

async function aggregateContributions(cwd) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const { days, start, end } = buildContributionDayRange();
	const index = await getSessionFileIndex(resolvedCwd);
	await Promise.all([...index.values()].map((file) => scanSessionFileContributions(file, days)));
	const total = Object.values(days).reduce((sum, count) => sum + count, 0);
	return { days, total, start, end, cwd: resolvedCwd };
}

export async function getContributions(cwd, { bust = false } = {}) {
	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const cached = contributionsCache.get(resolvedCwd);
	if (!bust && cached && Date.now() - cached.at < 30_000) {
		return cached.data;
	}
	const data = await aggregateContributions(resolvedCwd);
	contributionsCache.set(resolvedCwd, { at: Date.now(), data });
	return data;
}

export function invalidateContributionsCache(cwd) {
	if (cwd) contributionsCache.delete(resolve(cwd));
	else contributionsCache.clear();
}
