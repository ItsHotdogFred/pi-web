import { open } from "node:fs/promises";
import { basename } from "node:path";

export function timestampFromSessionFilename(filePath) {
	const name = basename(filePath);
	const match = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+)Z_/);
	if (!match) return null;
	return `${match[1]}:${match[2]}:${match[3]}.${match[4]}Z`;
}

export function updatedAtFromJsonl(content) {
	let latest = null;
	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			continue;
		}
		const ts = row.timestamp ?? row.message?.timestamp;
		if (!ts) continue;
		if (!latest || new Date(ts).getTime() > new Date(latest).getTime()) latest = ts;
	}
	return latest;
}

async function lastTimestampFromFile(filePath) {
	try {
		const handle = await open(filePath, "r");
		const stat = await handle.stat();
		const readSize = Math.min(stat.size, 8192);
		const buf = Buffer.alloc(readSize);
		await handle.read(buf, 0, readSize, Math.max(0, stat.size - readSize));
		await handle.close();

		const tail = buf.toString("utf8");
		for (const line of tail.split("\n").reverse()) {
			if (!line.trim()) continue;
			let row;
			try {
				row = JSON.parse(line);
			} catch {
				continue;
			}
			const ts = row.timestamp ?? row.message?.timestamp;
			if (ts) return ts;
		}
	} catch {
		// ignore unreadable files
	}
	return timestampFromSessionFilename(filePath);
}

export async function enrichSessionsWithTimestamps(sessions, fileIndex) {
	if (!Array.isArray(sessions) || !fileIndex?.size) return sessions;

	const timestamps = new Map(
		await Promise.all(
			sessions.map(async (session) => {
				const filePath = fileIndex.get(session.sessionId);
				if (!filePath) return [session.sessionId, null];
				return [session.sessionId, await lastTimestampFromFile(filePath)];
			}),
		),
	);

	return sessions.map((session) => {
		const updatedAt = timestamps.get(session.sessionId);
		if (updatedAt) return { ...session, updatedAt };
		return session;
	});
}
