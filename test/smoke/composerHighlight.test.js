import test from "node:test";
import assert from "node:assert/strict";
import { buildComposerHighlightHtml } from "../../public/js/composer/highlight.js";

test("buildComposerHighlightHtml strips @ and wraps file refs in blue spans", () => {
	const html = buildComposerHighlightHtml(
		"Check @.pake-target/release/.fingerprint/ and @.pake-target/release/ please",
	);
	assert.match(html, /class="composer-file-ref">\.pake-target\/release\/\.fingerprint\/</);
	assert.match(html, /class="composer-file-ref">\.pake-target\/release\/</);
	assert.doesNotMatch(html, /@/);
});

test("buildComposerHighlightHtml ignores email addresses", () => {
	const html = buildComposerHighlightHtml("email me at user@example.com");
	assert.equal(html, "email me at user@example.com");
});
