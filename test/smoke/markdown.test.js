import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { marked } from "marked";
import { installDom } from "./helpers/dom.js";

installDom();

const { renderMarkdown, enhanceAssistantCodeBlocks, enhanceMermaidBlocks } = await import(
	"../../public/js/utils/markdown.js"
);

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

	it("replaces mermaid fenced blocks with diagram markup without rendering", async () => {
		window.marked = marked;

		const container = document.createElement("div");
		container.innerHTML = renderMarkdown("```mermaid\ngraph TD\n  A --> B\n```");
		enhanceMermaidBlocks(container);

		const diagram = container.querySelector(".mermaid-diagram");
		assert.ok(diagram);

		const deadline = Date.now() + 500;
		while (!diagram.dataset.mermaidRendered && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		assert.equal(diagram.dataset.mermaidRendered, "1");
		assert.ok(diagram.querySelector(".mermaid-fallback code.language-mermaid"));
		assert.match(diagram.textContent, /graph TD/);
		assert.ok(!container.querySelector(".code-block"));
	});

	it("skips mermaid blocks when enhancing code copy buttons", async () => {
		window.marked = marked;

		const container = document.createElement("div");
		container.innerHTML = renderMarkdown("```mermaid\nflowchart LR\n  X --> Y\n```");
		enhanceAssistantCodeBlocks(container);
		enhanceMermaidBlocks(container);
		await new Promise((resolve) => setTimeout(resolve, 0));

		assert.ok(!container.querySelector(".code-block"));
		assert.ok(container.querySelector(".mermaid-diagram"));
	});
});
