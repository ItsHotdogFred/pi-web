import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const smokeDir = join(dirname(fileURLToPath(import.meta.url)), "smoke");
const files = readdirSync(smokeDir)
	.filter((name) => name.endsWith(".test.js"))
	.map((name) => join(smokeDir, name))
	.sort();

const result = spawnSync(process.execPath, ["--test", "--test-force-exit", ...files], {
	stdio: "inherit",
});

process.exit(result.status ?? 1);
