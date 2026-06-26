import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { projectNotePath, readProjectNote, writeProjectNote } from "../../src/projects/note.js";

test("readProjectNote returns empty content when note file is missing", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-web-note-"));
	try {
		const result = await readProjectNote(dir);
		assert.equal(result.content, "");
		assert.equal(result.exists, false);
		assert.equal(result.path, projectNotePath(dir));
		assert.equal(result.cwd, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("writeProjectNote creates .pi-web/note.md and readProjectNote reads it back", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-web-note-"));
	try {
		const written = await writeProjectNote(dir, "Ship the login fix\n");
		assert.equal(written.content, "Ship the login fix\n");
		assert.equal(written.exists, true);
		assert.equal(written.path, projectNotePath(dir));

		const onDisk = await readFile(projectNotePath(dir), "utf8");
		assert.equal(onDisk, "Ship the login fix\n");

		const loaded = await readProjectNote(dir);
		assert.equal(loaded.content, "Ship the login fix\n");
		assert.equal(loaded.exists, true);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
