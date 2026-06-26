import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import { installDom } from "./helpers/dom.js";

installDom();

const { renderMarkdown } = await import("../../public/js/utils/markdown.js");

describe("renderMarkdown", () => {
	before(() => {
		window.marked = marked;
	});

	after(() => {
		delete window.marked;
	});

	it("strips script tags and dangerous URLs when marked is loaded", () => {
		const withScript = renderMarkdown("**bold**\n\n<script>alert(1)</script>");
		assert.ok(!withScript.includes("<script"));
		assert.match(withScript, /<strong>bold<\/strong>/);

		const withBadLink = renderMarkdown('[click](javascript:alert(1))');
		assert.ok(!withBadLink.includes("javascript:"));
	});

	it("falls back to escaped HTML when marked is not loaded", () => {
		delete window.marked;

		const html = renderMarkdown('<script>alert(1)</script>\nline two');
		assert.equal(
			html,
			"&lt;script&gt;alert(1)&lt;/script&gt;<br>line two",
		);
	});
});
