import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const NOTE_DIR = ".pi-web";
const NOTE_FILE = "note.md";

export function projectNotePath(cwd) {
	return join(cwd, NOTE_DIR, NOTE_FILE);
}

export async function readProjectNote(cwd) {
	const path = projectNotePath(cwd);
	try {
		const content = await readFile(path, "utf8");
		return { content, path, exists: true, cwd };
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return { content: "", path, exists: false, cwd };
		}
		throw error;
	}
}

export async function writeProjectNote(cwd, content) {
	const path = projectNotePath(cwd);
	await mkdir(join(cwd, NOTE_DIR), { recursive: true });
	await writeFile(path, content, "utf8");
	return { content, path, exists: true, cwd };
}
