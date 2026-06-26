import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { getContributions } from "../../src/analytics/contributions.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test("getContributions returns day counts, total, and date range", async () => {
	const result = await getContributions(REPO_ROOT);

	assert.equal(typeof result.total, "number");
	assert.ok(result.total >= 0);
	assert.match(result.start, ISO_DATE);
	assert.match(result.end, ISO_DATE);
	assert.equal(typeof result.days, "object");
	assert.ok(result.days);

	const dayKeys = Object.keys(result.days);
	assert.equal(dayKeys.length, 365);
	assert.ok(dayKeys.every((key) => ISO_DATE.test(key)));
	assert.ok(dayKeys.every((key) => typeof result.days[key] === "number"));
	assert.equal(result.cwd, REPO_ROOT);
});
