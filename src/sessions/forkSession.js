import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { getSessionFileIndex } from "./sessionFiles.js";

const CURRENT_SESSION_VERSION = 3;

function parseJsonlLines(content) {
	const entries = [];
	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		try {
			entries.push(JSON.parse(line));
		} catch {
			// skip malformed lines
		}
	}
	return entries;
}

function getBranch(fromId, byId) {
	const path = [];
	let current = fromId ? byId.get(fromId) : undefined;
	while (current) {
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return path;
}

function resolveActivePath(entries) {
	const sessionEntries = entries.filter((e) => e.type !== "session");
	if (sessionEntries.length === 0) return [];

	const byId = new Map();
	let leafId = null;
	for (const entry of sessionEntries) {
		byId.set(entry.id, entry);
		leafId = entry.id;
	}

	const usesTree = sessionEntries.some((e) => "parentId" in e);
	if (!usesTree) {
		return sessionEntries.filter((e) => e.type !== "label");
	}

	return getBranch(leafId, byId).filter((e) => e.type !== "label");
}

function extractUserText(message) {
	const content = message?.content;
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("")
		.trim();
}

function deriveSessionTitle(entries, path) {
	for (let i = path.length - 1; i >= 0; i--) {
		const entry = path[i];
		if (entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim()) {
			return entry.name.trim();
		}
	}
	for (const entry of path) {
		if (entry.type === "message" && entry.message?.role === "user") {
			const text = extractUserText(entry.message);
			if (text) return text.length > 72 ? `${text.slice(0, 69)}…` : text;
		}
	}
	for (const entry of entries) {
		if (entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim()) {
			return entry.name.trim();
		}
	}
	return "New Agent";
}

function findUserMessages(path) {
	return path.filter((entry) => entry.type === "message" && entry.message?.role === "user");
}

/** Keep through the full turn for promptIndex (user message + assistant/tool replies before the next user). */
function slicePathThroughPromptTurn(path, userMessages, promptIndex) {
	const targetEntry = userMessages[promptIndex - 1];
	const startIndex = path.indexOf(targetEntry);
	if (startIndex < 0) {
		throw new Error("Could not locate prompt in session path");
	}

	const nextUser = userMessages[promptIndex];
	const endIndex = nextUser ? path.indexOf(nextUser) : path.length;
	if (endIndex < 0) {
		throw new Error("Could not locate next prompt in session path");
	}

	return path.slice(0, endIndex);
}

export async function forkSession({ cwd, sourceSessionId, promptIndex }) {
	if (!sourceSessionId || typeof sourceSessionId !== "string") {
		throw new Error("sourceSessionId is required");
	}
	if (!Number.isInteger(promptIndex) || promptIndex < 1) {
		throw new Error("promptIndex must be a positive integer");
	}

	const resolvedCwd = resolve(cwd);
	const index = await getSessionFileIndex(resolvedCwd);
	const sourcePath = index.get(sourceSessionId);
	if (!sourcePath) {
		throw new Error("Source session not found");
	}

	const content = await readFile(sourcePath, "utf8");
	const entries = parseJsonlLines(content);
	const header = entries[0];
	if (header?.type !== "session" || typeof header.id !== "string") {
		throw new Error("Invalid session file");
	}

	const path = resolveActivePath(entries);
	const userMessages = findUserMessages(path);
	if (promptIndex > userMessages.length) {
		throw new Error(`promptIndex ${promptIndex} exceeds prompt count (${userMessages.length})`);
	}

	const truncatedPath = slicePathThroughPromptTurn(path, userMessages, promptIndex);
	const originalTitle = deriveSessionTitle(entries, path);
	const forkTitle = `Fork · ${originalTitle}`;

	const newSessionId = randomUUID();
	const timestamp = new Date().toISOString();
	const fileTimestamp = timestamp.replace(/[:.]/g, "-");
	const sessionDir = dirname(sourcePath);
	const newSessionFile = join(sessionDir, `${fileTimestamp}_${newSessionId}.jsonl`);

	const newHeader = {
		type: "session",
		version: header.version ?? CURRENT_SESSION_VERSION,
		id: newSessionId,
		timestamp,
		cwd: header.cwd || resolvedCwd,
		parentSession: sourcePath,
	};

	const fileEntries = [newHeader, ...truncatedPath];
	const usesTree = entries.some((e) => e.type !== "session" && "parentId" in e);
	if (usesTree) {
		const lastEntryId = truncatedPath[truncatedPath.length - 1]?.id ?? null;
		fileEntries.push({
			type: "session_info",
			id: randomUUID(),
			parentId: lastEntryId,
			timestamp,
			name: forkTitle,
		});
	}

	await mkdir(sessionDir, { recursive: true });
	await writeFile(newSessionFile, `${fileEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

	return { sessionId: newSessionId, title: forkTitle };
}
