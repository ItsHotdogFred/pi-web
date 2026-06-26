import { readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	"coverage",
	"__pycache__",
	".cache",
	".turbo",
	"vendor",
]);

const MAX_FILES = 3000;
const MAX_DEPTH = 12;

export async function listProjectFiles(root) {
	const files = [];

	async function walk(absDir, relDir, depth) {
		if (files.length >= MAX_FILES || depth > MAX_DEPTH) return;

		let entries;
		try {
			entries = await readdir(absDir, { withFileTypes: true });
		} catch {
			return;
		}

		entries.sort((a, b) => {
			if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		for (const entry of entries) {
			if (files.length >= MAX_FILES) return;

			const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
			const normalized = relPath.replace(/\\/g, "/");

			if (entry.isDirectory()) {
				if (SKIP_DIRS.has(entry.name)) continue;
				files.push({ path: normalized, type: "dir" });
				await walk(join(absDir, entry.name), relPath, depth + 1);
			} else if (entry.isFile()) {
				files.push({ path: normalized, type: "file" });
			}
		}
	}

	await walk(root, "", 0);
	return files;
}
