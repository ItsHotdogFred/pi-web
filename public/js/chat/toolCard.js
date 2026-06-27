import { app } from "../state/store.js";
import {
	formatRaw,
	parseToolPayload,
	extractFilePath,
	isDiffToolName,
	normalizeStatus,
	statusLabel,
} from "../utils/format.js";
import {
	resolveToolName,
	mergeToolName,
} from "../utils/tools.js";
import { animateEnter } from "../utils/animation.js";
import {
	appendChatNode,
	finalizeThoughtBlock,
	scrollToBottom,
} from "./messages.js";
import { trackFileFromTool } from "./fileContext.js";
import { extractDiffFromTool, syncToolDiffSection } from "./toolDiff.js";
import { isSubagentTool, renderSubagentPanel, syncSubagentToolCard } from "./subagent.js";

function createToolCard(id) {
	finalizeThoughtBlock();
	const card = document.createElement("article");
	card.className = "tool-card";
	card.dataset.toolId = id;
	card.innerHTML = `
		<button type="button" class="tool-header" aria-expanded="false">
			<span class="tool-chevron" aria-hidden="true">▶</span>
			<span class="tool-name"></span>
			<span class="tool-status"></span>
		</button>
		<div class="tool-body">
			<div class="tool-section tool-input-section"><div class="tool-section-label">Input</div><pre class="tool-input"></pre></div>
			<div class="tool-section tool-output-section"><div class="tool-section-label">Output</div><pre class="tool-output"></pre></div>
		</div>`;

	card.querySelector(".tool-header").addEventListener("click", () => {
		const expanded = card.classList.toggle("expanded");
		card.querySelector(".tool-header").setAttribute("aria-expanded", String(expanded));
		const state = app.chat.toolCards.get(id);
		if (state && isSubagentTool(state)) renderSubagentPanel(state);
	});

	appendChatNode(card, { beforeStreaming: !app.session.batchHistoryMode });
	animateEnter(card, "anim-fade-up");

	const state = { el: card, title: null, toolName: null, kind: null, rawInput: null, rawOutput: null, status: "running" };
	app.chat.toolCards.set(id, state);
	return state;
}

export function updateToolCard(msg) {
	const id = msg.id;
	if (!id) return;

	let state = app.chat.toolCards.get(id);
	if (!state) state = createToolCard(id);

	if (msg.title) state.title = mergeToolName(state.title, msg.title);
	if (msg.toolName) state.toolName = mergeToolName(state.toolName, msg.toolName);
	if (msg.kind) state.kind = msg.kind;
	if (msg.rawInput != null) state.rawInput = msg.rawInput;
	if (msg.rawOutput != null) state.rawOutput = msg.rawOutput;
	if (msg.status != null) state.status = msg.status;

	const card = state.el;

	if (isSubagentTool(state)) {
		syncSubagentToolCard(state);
		trackFileFromTool(state);
		scrollToBottom();
		return;
	}

	card.classList.remove("tool-card--subagent");
	card.querySelector(".tool-name").textContent = resolveToolName(state);

	const statusBadge = card.querySelector(".tool-status");
	const norm = normalizeStatus(state.status);
	statusBadge.className = `tool-status tool-status-${norm}`;
	statusBadge.textContent = statusLabel(state.status);

	for (const [key, prop] of [["tool-input", state.rawInput], ["tool-output", state.rawOutput]]) {
		const pre = card.querySelector(`.${key}`);
		if (!pre) continue;
		const section = pre.closest(".tool-section");
		const text = formatRaw(prop);
		if (text) {
			pre.textContent = text;
			section.style.display = "";
		} else {
			section.style.display = "none";
		}
	}

	const toolName = resolveToolName(state).toLowerCase();
	const payload = parseToolPayload(state.rawInput);
	const filePath = extractFilePath(payload);
	const diff = isDiffToolName(toolName) ? extractDiffFromTool(state) : null;
	syncToolDiffSection(card, diff, filePath);

	trackFileFromTool(state);
	scrollToBottom();
}
