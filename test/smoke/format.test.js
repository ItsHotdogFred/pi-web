import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	escapeHtml,
	formatTokenCount,
	looksLikeUnifiedDiff,
	buildSyntheticDiff,
	buildWriteDiff,
	buildEditDiffFromInput,
	extractFilePath,
	parseToolPayload,
	isDiffToolName,
} from "../../public/js/utils/format.js";

describe("escapeHtml", () => {
	it("escapes &, <, >, and double quotes", () => {
		assert.equal(
			escapeHtml('a & b <tag> "quote"'),
			"a &amp; b &lt;tag&gt; &quot;quote&quot;",
		);
	});
});

describe("formatTokenCount", () => {
	it("formats token counts", () => {
		assert.equal(formatTokenCount(999), "999");
		assert.equal(formatTokenCount(1500), "1.5k");
		assert.equal(formatTokenCount(10000), "10k");
		assert.equal(formatTokenCount(1500000), "1.5M");
	});
});

describe("looksLikeUnifiedDiff", () => {
	it("detects unified diff headers", () => {
		assert.equal(looksLikeUnifiedDiff("--- a/foo\n+++ b/foo"), true);
		assert.equal(looksLikeUnifiedDiff("@@ -1,3 +1,4 @@"), true);
		assert.equal(looksLikeUnifiedDiff("plain text"), false);
		assert.equal(looksLikeUnifiedDiff(""), false);
	});
});

describe("diff builders", () => {
	it("buildSyntheticDiff produces valid diff text", () => {
		const diff = buildSyntheticDiff({
			path: "src/app.js",
			old_string: "old line",
			new_string: "new line",
		});
		assert.equal(looksLikeUnifiedDiff(diff), true);
		assert.match(diff, /^--- a\/src\/app.js/m);
		assert.match(diff, /^\+new line/m);
		assert.match(diff, /^-old line/m);
	});

	it("buildWriteDiff produces valid diff text", () => {
		const diff = buildWriteDiff({ path: "new.txt", content: "hello\nworld" });
		assert.equal(looksLikeUnifiedDiff(diff), true);
		assert.match(diff, /^--- \/dev\/null/m);
		assert.match(diff, /^\+hello/m);
		assert.match(diff, /^\+world/m);
	});

	it("buildEditDiffFromInput produces valid diff text", () => {
		const fromEdits = buildEditDiffFromInput({
			path: "edit.js",
			edits: [{ oldText: "before", newText: "after" }],
		});
		assert.equal(looksLikeUnifiedDiff(fromEdits), true);
		assert.match(fromEdits, /^-before/m);
		assert.match(fromEdits, /^\+after/m);

		const fromStrings = buildEditDiffFromInput({
			file_path: "edit.js",
			old_string: "x",
			new_string: "y",
		});
		assert.equal(looksLikeUnifiedDiff(fromStrings), true);
	});
});

describe("extractFilePath", () => {
	it("finds path from various keys", () => {
		assert.equal(extractFilePath({ path: "/a/b.js" }), "/a/b.js");
		assert.equal(extractFilePath({ file_path: "c.js" }), "c.js");
		assert.equal(extractFilePath({ filePath: "d.js" }), "d.js");
		assert.equal(extractFilePath({ file: "e.js" }), "e.js");
		assert.equal(extractFilePath({ target: "f.js" }), "f.js");
		assert.equal(extractFilePath({}), null);
	});
});

describe("parseToolPayload", () => {
	it("handles truncated wire objects", () => {
		const payload = parseToolPayload({
			truncated: true,
			preview: '{"path":"foo.js","content":"hi"}',
		});
		assert.deepEqual(payload, { path: "foo.js", content: "hi" });

		assert.deepEqual(parseToolPayload({ path: "direct.js" }), { path: "direct.js" });
		assert.equal(parseToolPayload('{"ok":true}').ok, true);
		assert.equal(parseToolPayload("{bad json"), null);
	});
});

describe("isDiffToolName", () => {
	it("matches diff-related tool names", () => {
		for (const name of ["edit", "write", "patch", "replace", "create"]) {
			assert.equal(isDiffToolName(name), true);
			assert.equal(isDiffToolName(name.toUpperCase()), true);
		}
		assert.equal(isDiffToolName("read"), false);
		assert.equal(isDiffToolName(""), false);
	});
});
