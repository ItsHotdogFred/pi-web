import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, test } from "node:test";

import { listProjectFiles } from "../../src/projects/files.js";

describe("listProjectFiles", () => {
	test("returns project-relative paths for files and directories", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-web-files-"));
		try {
			await mkdir(join(root, "src", "utils"), { recursive: true });
			await writeFile(join(root, "src", "index.js"), "export {};\n");
			await writeFile(join(root, "README.md"), "# test\n");
			await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
			await writeFile(join(root, "node_modules", "pkg", "index.js"), "");

			const files = await listProjectFiles(root);
			const paths = files.map((entry) => entry.path);

			assert.ok(paths.includes("README.md"));
			assert.ok(paths.includes("src/index.js"));
			assert.ok(paths.includes("src"));
			assert.ok(paths.includes("src/utils"));
			assert.ok(!paths.some((path) => path.includes("node_modules")));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
