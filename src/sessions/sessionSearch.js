import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { DEFAULT_CWD } from "../config.js";
import { getSessionFileIndex } from "./sessionFiles.js";

const FILE_PATH_KEYS = ["path", "file_path", "filePath", "file", "target"];

function extractTextFromContent(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const part of content) {
		if (part?.type === "text" && typeof part.text === "string") {
			parts.push(part.text);
		} else if (part?.type === "toolCall") {
			if (typeof part.name === "string") parts.push(part.name);
			const args = part.arguments ?? part.input;
			if (args != null) {
				parts.push(typeof args === "string" ? args : JSON.stringify(args));
				const parsed = typeof args === "object" && args ? args : null;
				if (parsed) {
					for (const key of FILE_PATH_KEYS) {
						if (typeof parsed[key] === "string") parts.push(parsed[key]);
					}
				}
			}
		}
	}
	return parts.join(" ");
}

function extractSearchableTextFromLine(line) {
	if (!line.trim()) return "";
	let row;
	try {
		row = JSON.parse(line);
	} catch {
		return "";
	}
	if (row?.type !== "message") return "";
	const msg = row.message;
	if (!msg) return "";

	const role = msg.role;
	if (role === "user" || role === "assistant") {
		return extractTextFromContent(msg.content);
	}
	if (role === "toolResult") {
		if (typeof msg.toolName === "string") return `${msg.toolName} ${extractTextFromContent(msg.content)}`;
	}
	return "";
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

function deriveTitleFromContent(content) {
	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		if (row?.type === "session_info" && typeof row.name === "string" && row.name.trim()) {
			return row.name.trim();
		}
		if (row?.type === "message" && row.message?.role === "user") {
			const text = extractUserText(row.message);
			if (text) return text.length > 72 ? `${text.slice(0, 69)}…` : text;
		}
	}
	return undefined;
}

function normalizeTerms(query) {
	return query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
}

function scoreText(text, terms) {
	const lower = text.toLowerCase();
	let termsFound = 0;
	let matchCount = 0;
	for (const term of terms) {
		let termMatches = 0;
		let idx = 0;
		while (true) {
			const found = lower.indexOf(term, idx);
			if (found === -1) break;
			termMatches += 1;
			idx = found + term.length;
		}
		if (termMatches > 0) {
			termsFound += 1;
			matchCount += termMatches;
		}
	}
	return { score: termsFound, matchCount };
}

function buildSnippet(text, terms, maxLen = 160) {
	const lower = text.toLowerCase();
	let bestIdx = -1;
	for (const term of terms) {
		const idx = lower.indexOf(term);
		if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
	}
	if (bestIdx === -1) return text.slice(0, maxLen).trim();

	const start = Math.max(0, bestIdx - 40);
	const end = Math.min(text.length, start + maxLen);
	let snippet = text.slice(start, end).trim();
	if (start > 0) snippet = `…${snippet}`;
	if (end < text.length) snippet = `${snippet}…`;
	return snippet;
}

async function searchSessionFile(sessionId, filePath, terms) {
	try {
		const content = await readFile(filePath, "utf8");
		const chunks = [];
		for (const line of content.split("\n")) {
			const text = extractSearchableTextFromLine(line);
			if (text) chunks.push(text);
		}
		const combined = chunks.join("\n");
		if (!combined.trim()) return null;

		const { score, matchCount } = scoreText(combined, terms);
		if (score === 0) return null;

		return {
			sessionId,
			title: deriveTitleFromContent(content),
			snippet: buildSnippet(combined, terms),
			score,
			matchCount,
		};
	} catch {
		return null;
	}
}

export async function searchSessions(cwd, query, { limit = 20 } = {}) {
	const terms = normalizeTerms(query);
	if (terms.length === 0) return { results: [] };

	const resolvedCwd = resolve(cwd || DEFAULT_CWD);
	const index = await getSessionFileIndex(resolvedCwd);
	const results = await Promise.all(
		[...index.entries()].map(([sessionId, filePath]) => searchSessionFile(sessionId, filePath, terms)),
	);

	return {
		results: results
			.filter(Boolean)
			.sort((a, b) => b.score - a.score || b.matchCount - a.matchCount)
			.slice(0, Math.max(1, limit)),
	};
}
