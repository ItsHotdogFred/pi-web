import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import { installDom } from "./helpers/dom.js";

installDom();

const { renderMarkdown, enhanceAssistantCodeBlocks } = await import("../../public/js/utils/markdown.js");

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

	it("wraps fenced code blocks with a copy button", () => {
		window.marked = marked;

		const container = document.createElement("div");
		container.innerHTML = renderMarkdown("```js\nconst x = 1;\n```");
		enhanceAssistantCodeBlocks(container);

		const block = container.querySelector(".code-block");
		assert.ok(block);
		assert.ok(block.querySelector(".code-copy-btn"));
		assert.match(block.querySelector("code").textContent, /const x = 1/);
	});
});
