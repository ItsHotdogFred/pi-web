import { messagesEl } from "../dom/elements.js";
import {
	formatRaw,
	parseRawObject,
	parseToolPayload,
	buildEditDiffFromInput,
	buildWriteDiff,
	looksLikeUnifiedDiff,
	renderDiffView,
} from "../utils/format.js";
import { resolveToolName } from "../utils/tools.js";
import { resolveAbsolutePath } from "./fileContext.js";

export function extractDiffFromTool(state) {
	const toolName = resolveToolName(state)?.toLowerCase() ?? "";
	const parsed = parseRawObject(state.rawOutput);
	if (parsed?.details?.diff && typeof parsed.details.diff === "string") return parsed.details.diff;
	if (parsed?.diff && typeof parsed.diff === "string") return parsed.diff;

	if (typeof state.rawOutput === "string" && looksLikeUnifiedDiff(state.rawOutput)) {
		return state.rawOutput;
	}

	const formatted = formatRaw(state.rawOutput);
	if (looksLikeUnifiedDiff(formatted)) return formatted;

	const input = parseToolPayload(state.rawInput);
	if (input) {
		const editDiff = buildEditDiffFromInput(input);
		if (editDiff) return editDiff;

		const writeContent = input.content ?? input.text;
		if ((toolName === "write" || toolName === "create") && writeContent != null) {
			return buildWriteDiff({ ...input, content: writeContent });
		}
	}

	return null;
}

export function syncToolDiffSection(card, diff, filePath) {
	let section = card.querySelector(".tool-diff-section");
	const outputSection = card.querySelector(".tool-output-section");
	const inputSection = card.querySelector(".tool-input-section");

	if (!diff) {
		section?.remove();
		delete card.dataset.diffPath;
		if (outputSection) outputSection.style.display = "";
		if (inputSection) inputSection.style.display = "";
		return;
	}

	if (!section) {
		section = document.createElement("div");
		section.className = "tool-section tool-diff-section";
		section.innerHTML = `<div class="tool-section-label">Diff</div><div class="tool-diff"></div>`;
		const body = card.querySelector(".tool-body");
		const output = card.querySelector(".tool-output-section");
		if (output) body.insertBefore(section, output);
		else body.appendChild(section);
	}

	section.style.display = "";
	section.querySelector(".tool-diff").innerHTML = renderDiffView(diff);
	if (filePath) card.dataset.diffPath = resolveAbsolutePath(filePath);
	else delete card.dataset.diffPath;

	if (inputSection) inputSection.style.display = "none";
	if (outputSection) {
		const outputText = card.querySelector(".tool-output")?.textContent?.trim();
		outputSection.style.display = outputText ? "" : "none";
	}

	if (!card.classList.contains("expanded")) {
		card.classList.add("expanded");
		card.querySelector(".tool-header")?.setAttribute("aria-expanded", "true");
	}
}

export function scrollToToolDiff(filePath) {
	const abs = resolveAbsolutePath(filePath);
	const cards = messagesEl.querySelectorAll("[data-diff-path]");
	for (const card of cards) {
		if (card.dataset.diffPath === abs) {
			card.classList.add("expanded");
			card.querySelector(".tool-header")?.setAttribute("aria-expanded", "true");
			card.scrollIntoView({ behavior: "smooth", block: "center" });
			return;
		}
	}
}
