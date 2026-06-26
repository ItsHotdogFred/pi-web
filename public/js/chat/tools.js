import { app } from "../state/store.js";
import { LANG_TAGS, EDITOR_PREF_KEY, EDITOR_OPTIONS } from "../config.js";
import { $, fileContextEl, messagesEl } from "../dom/elements.js";
import {
	basename,
	escapeHtml,
	formatRaw,
	parseRawObject,
	parseToolPayload,
	extractFilePath,
	buildEditDiffFromInput,
	buildWriteDiff,
	isDiffToolName,
	renderDiffView,
	looksLikeUnifiedDiff,
	normalizeStatus,
	statusLabel,
	truncateText,
} from "../utils/format.js";
import {
	resolveToolName,
	mergeToolName,
	formatSubagentToolCall,
} from "../utils/tools.js";
import { renderMarkdown } from "../utils/markdown.js";
import { animateEnter } from "../utils/animation.js";
import {
	appendChatNode,
	finalizeThoughtBlock,
	scrollToBottom,
} from "./messages.js";

export function clearChangedFiles() {
	app.changedFiles.clear();
	app.fileDiffs.clear();
	renderFileContext();
}

function fileLangTag(path) {
	const ext = path.split(".").pop()?.toLowerCase() || "";
	return LANG_TAGS[ext] || ext.toUpperCase().slice(0, 4) || "FILE";
}

function resolveAbsolutePath(path) {
	if (!path) return "";
	const normalized = String(path).replace(/\\/g, "/");
	if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) return normalized;
	const base = (app.cwd || app.gitInfo.path || "").replace(/\\/g, "/").replace(/\/$/, "");
	if (!base) return normalized.replace(/^\.\//, "");
	return `${base}/${normalized.replace(/^\.\//, "")}`;
}

function getPreferredEditor() {
	try {
		const stored = localStorage.getItem(EDITOR_PREF_KEY);
		if (stored && EDITOR_OPTIONS.some((option) => option.id === stored)) return stored;
	} catch {
		/* ignore */
	}
	return "cursor";
}

function setPreferredEditor(editorId) {
	try {
		localStorage.setItem(EDITOR_PREF_KEY, editorId);
	} catch {
		/* ignore */
	}
	renderFileContext();
}

function buildEditorUrl(editorId, filePath, line = 1) {
	const abs = resolveAbsolutePath(filePath);
	const path = abs.replace(/\\/g, "/");
	const loc = line > 1 ? `:${line}` : "";
	switch (editorId) {
		case "cursor":
			return `cursor://file/${path}${loc}`;
		case "zed":
			return `zed://file/${path}${loc}`;
		default:
			return `vscode://file/${path}${loc}`;
	}
}

function openInEditor(filePath, line = 1) {
	const url = buildEditorUrl(getPreferredEditor(), filePath, line);
	window.location.href = url;
}

function extractDiffFromTool(state) {
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

function syncToolDiffSection(card, diff, filePath) {
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

function scrollToToolDiff(filePath) {
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

export function resetPlanPanel() {
	app.activePlanPanel = null;
}

function normalizePlanEntry(entry) {
	if (typeof entry === "string") {
		return { content: entry, priority: "medium", status: "pending" };
	}
	return {
		content: entry?.content ?? entry?.description ?? entry?.text ?? "Task",
		priority: entry?.priority ?? "medium",
		status: entry?.status ?? "pending",
	};
}

function planStatusIcon(status) {
	switch (status) {
		case "completed":
			return "✓";
		case "in_progress":
			return "◌";
		default:
			return "○";
	}
}

export function renderPlanPanel(entries) {
	const normalized = (Array.isArray(entries) ? entries : []).map(normalizePlanEntry);
	if (!normalized.length) return null;

	let panel = app.activePlanPanel;
	if (!panel?.isConnected) {
		finalizeThoughtBlock();
		panel = document.createElement("article");
		panel.className = "msg msg-plan plan-panel";
		panel.innerHTML = `<span class="msg-label">Plan</span><ol class="plan-list"></ol>`;
		appendChatNode(panel);
		if (!app.batchHistoryMode) animateEnter(panel, "anim-fade-up");
		app.activePlanPanel = panel;
	}

	const list = panel.querySelector(".plan-list");
	list.replaceChildren();
	for (const entry of normalized) {
		const li = document.createElement("li");
		li.className = `plan-item plan-item--${entry.status} plan-item--priority-${entry.priority}`;
		const priorityHtml =
			entry.priority !== "medium"
				? `<span class="plan-priority plan-priority--${entry.priority}">${entry.priority}</span>`
				: "";
		li.innerHTML = `
			<span class="plan-status" aria-hidden="true">${planStatusIcon(entry.status)}</span>
			<span class="plan-text">${escapeHtml(entry.content)}</span>
			${priorityHtml}`;
		list.appendChild(li);
	}
	scrollToBottom();
	return panel;
}

function renderFileContextEditorPicker() {
	let picker = fileContextEl?.querySelector(".file-context-editor-picker");
	if (!picker && fileContextEl) {
		const header = fileContextEl.querySelector(".file-context-header");
		if (!header) return;
		picker = document.createElement("div");
		picker.className = "file-context-editor-picker";
		picker.setAttribute("role", "group");
		picker.setAttribute("aria-label", "Open files in");
		picker.addEventListener("click", (event) => event.stopPropagation());
		header.appendChild(picker);
	}

	if (!picker) return;

	const preferred = getPreferredEditor();
	picker.replaceChildren();
	for (const option of EDITOR_OPTIONS) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `file-context-editor-btn${option.id === preferred ? " active" : ""}`;
		btn.textContent = option.label;
		btn.title = `Open files in ${option.label}`;
		btn.addEventListener("click", (event) => {
			event.stopPropagation();
			setPreferredEditor(option.id);
		});
		picker.appendChild(btn);
	}
}

function trackFileFromTool(state) {
	const toolName = resolveToolName(state).toLowerCase();
	if (!/(write|edit|patch|replace|create|fs)/.test(toolName)) return;

	const payload = parseToolPayload(state.rawInput);
	const path = extractFilePath(payload);
	if (!path) return;

	app.changedFiles.add(path);

	const diff = extractDiffFromTool(state);
	if (diff) app.fileDiffs.set(path, diff);

	renderFileContext();
}

export function renderFileContext() {
	const countEl = $("file-context-count");
	const listEl = $("file-context-list");
	if (!fileContextEl || !countEl || !listEl) return;

	const files = [...app.changedFiles].sort((a, b) => a.localeCompare(b));
	const wasHidden = fileContextEl.classList.contains("hidden");
	if (files.length === 0) {
		fileContextEl.classList.add("hidden");
		return;
	}

	fileContextEl.classList.remove("hidden");
	if (wasHidden) animateEnter(fileContextEl, "anim-fade-up");
	fileContextEl.classList.toggle("collapsed", app.fileContextCollapsed);
	$("file-context-toggle")?.setAttribute("aria-expanded", String(!app.fileContextCollapsed));
	countEl.textContent = `${files.length} File${files.length === 1 ? "" : "s"} Touched`;
	renderFileContextEditorPicker();

	listEl.replaceChildren();
	for (const path of files) {
		const li = document.createElement("li");
		li.className = "file-context-item";
		const hasDiff = app.fileDiffs.has(path);

		const fileBtn = document.createElement("button");
		fileBtn.type = "button";
		fileBtn.className = "file-context-file";
		fileBtn.title = resolveAbsolutePath(path);
		fileBtn.innerHTML = `
			<span class="file-context-lang">${fileLangTag(path)}</span>
			<span class="file-context-name">${escapeHtml(basename(path))}</span>`;
		fileBtn.addEventListener("click", () => openInEditor(path));

		const actions = document.createElement("div");
		actions.className = "file-context-actions";

		const openBtn = document.createElement("button");
		openBtn.type = "button";
		openBtn.className = "file-context-action";
		openBtn.textContent = "Open";
		openBtn.title = `Open in ${EDITOR_OPTIONS.find((o) => o.id === getPreferredEditor())?.label ?? "editor"}`;
		openBtn.addEventListener("click", () => openInEditor(path));

		actions.appendChild(openBtn);

		if (hasDiff) {
			const diffBtn = document.createElement("button");
			diffBtn.type = "button";
			diffBtn.className = "file-context-action file-context-action--diff";
			diffBtn.textContent = "Diff";
			diffBtn.addEventListener("click", () => scrollToToolDiff(path));
			actions.appendChild(diffBtn);
		}

		li.append(fileBtn, actions);
		listEl.appendChild(li);
	}
}

function isSubagentTool(state) {
	return resolveToolName(state).toLowerCase() === "subagent";
}

function parseSubagentDetails(rawOutput) {
	const obj = parseRawObject(rawOutput);
	if (!obj) return null;
	if (obj.details && Array.isArray(obj.details.results)) return obj.details;
	if (Array.isArray(obj.results) && obj.mode) return obj;
	return null;
}

function subagentFinalOutput(result) {
	if (result?.finalOutput) return result.finalOutput;
	const messages = Array.isArray(result?.messages) ? result.messages : [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part?.type === "text" && part.text) return part.text;
		}
	}
	return "";
}

function subagentDisplayItems(messages) {
	const items = [];
	for (const message of messages ?? []) {
		if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			if (part?.type === "text" && part.text) items.push({ type: "text", text: part.text });
			else if (part?.type === "toolCall") {
				items.push({ type: "toolCall", name: part.name ?? "tool", args: part.arguments ?? {} });
			}
		}
	}
	return items;
}

function subagentResultStatus(result, toolRunning) {
	if (result.exitCode === -1) return "running";
	if (toolRunning && result.exitCode === 0 && !subagentFinalOutput(result) && !result.errorMessage) {
		return "running";
	}
	if (result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted") {
		return "failed";
	}
	return "completed";
}

function subagentHeaderLabel(details, rawInput) {
	if (!details) {
		const input = parseRawObject(rawInput);
		if (Array.isArray(input?.chain) && input.chain.length) return `subagent · chain (${input.chain.length})`;
		if (Array.isArray(input?.tasks) && input.tasks.length) {
			return `subagent · parallel (${input.tasks.length})`;
		}
		if (input?.agent) return `subagent · ${input.agent}`;
		return "subagent";
	}

	if (details.mode === "chain") return `subagent · chain (${details.results.length})`;
	if (details.mode === "parallel") {
		const running = details.results.filter((result) => result.exitCode === -1).length;
		if (running) {
			const done = details.results.length - running;
			return `subagent · parallel · ${done}/${details.results.length}`;
		}
		return `subagent · parallel (${details.results.length})`;
	}
	if (details.results.length === 1) return `subagent · ${details.results[0].agent}`;
	return "subagent";
}

function subagentStatusLabel(details, toolRunning) {
	if (!details) return toolRunning ? "running" : "done";
	const results = [...details.results];
	if (details.aggregator) results.push(details.aggregator);
	const running = results.filter((result) => subagentResultStatus(result, toolRunning) === "running").length;
	if (running) return `${results.length - running}/${results.length}`;
	const failed = results.filter((result) => subagentResultStatus(result, false) === "failed").length;
	if (failed) return `${failed} failed`;
	return "done";
}

function renderSubagentNestedItems(items, expanded) {
	const limit = expanded ? items.length : 5;
	const slice = items.slice(-limit);
	const skipped = items.length - slice.length;
	let html = "";
	if (skipped > 0) {
		html += `<div class="subagent-nested-meta">${skipped} earlier step${skipped === 1 ? "" : "s"}</div>`;
	}
	for (const item of slice) {
		if (item.type === "text") {
			html += `<div class="subagent-nested-text">${renderMarkdown(truncateText(item.text, expanded ? 1200 : 240))}</div>`;
		} else {
			html += `<div class="subagent-nested-tool">→ ${formatSubagentToolCall(item.name, item.args)}</div>`;
		}
	}
	return html;
}

function renderSubagentResult(result, toolRunning, expanded) {
	const status = subagentResultStatus(result, toolRunning);
	const items = subagentDisplayItems(result.messages);
	const output = subagentFinalOutput(result);
	const icon = status === "running" ? "◌" : status === "failed" ? "✗" : "✓";
	const source = result.agentSource ? ` (${result.agentSource})` : "";
	const step =
		typeof result.step === "number" ? `<span class="subagent-item-step">step ${result.step + 1}</span>` : "";

	let body = `<div class="subagent-item-task">${truncateText(result.task, expanded ? 600 : 180)}</div>`;
	if (result.errorMessage) {
		body += `<div class="subagent-item-error">${result.errorMessage}</div>`;
	} else if (items.length) {
		body += `<div class="subagent-item-activity">${renderSubagentNestedItems(items, expanded)}</div>`;
	} else if (status === "running") {
		body += `<div class="subagent-item-meta">Running…</div>`;
	}

	if (output && status !== "running") {
		body += `<div class="subagent-item-output">${renderMarkdown(truncateText(output, expanded ? 4000 : 320))}</div>`;
	} else if (!items.length && !result.errorMessage && status !== "running") {
		body += `<div class="subagent-item-meta">No output</div>`;
	}

	return `<article class="subagent-item subagent-item--${status}">
		<div class="subagent-item-header">
			<span class="subagent-item-icon" aria-hidden="true">${icon}</span>
			<span class="subagent-item-name">${result.agent}${source}</span>
			${step}
			<span class="subagent-item-status">${status}</span>
		</div>
		${body}
	</article>`;
}

function renderSubagentPanel(state) {
	const card = state.el;
	const details = parseSubagentDetails(state.rawOutput);
	const input = parseRawObject(state.rawInput);
	const toolRunning = ["running", "in_progress", "pending"].includes(normalizeStatus(state.status));
	const expanded = card.classList.contains("expanded");
	let html = `<div class="subagent-panel">`;

	if (details) {
		const scope = details.agentScope ? `<span class="subagent-chip">${details.agentScope}</span>` : "";
		html += `<div class="subagent-summary">${scope}<span class="subagent-mode">${details.mode}</span></div>`;
		html += `<div class="subagent-list">`;
		for (const result of details.results) {
			html += renderSubagentResult(result, toolRunning, expanded);
		}
		if (details.aggregator) {
			html += `<div class="subagent-fanin-label">Fan-in</div>`;
			html += renderSubagentResult(details.aggregator, toolRunning, expanded);
		}
		html += `</div>`;
	} else if (input) {
		html += `<div class="subagent-list">`;
		if (Array.isArray(input.chain)) {
			for (const step of input.chain) {
				html += renderSubagentResult(
					{ agent: step.agent, agentSource: "pending", task: step.task, exitCode: -1, messages: [] },
					true,
					expanded,
				);
			}
		} else if (Array.isArray(input.tasks)) {
			for (const task of input.tasks) {
				html += renderSubagentResult(
					{ agent: task.agent, agentSource: "pending", task: task.task, exitCode: -1, messages: [] },
					true,
					expanded,
				);
			}
		} else if (input.agent && input.task) {
			html += renderSubagentResult(
				{ agent: input.agent, agentSource: "pending", task: input.task, exitCode: -1, messages: [] },
				true,
				expanded,
			);
		}
		html += `</div>`;
	} else {
		const fallback = formatRaw(state.rawOutput) || formatRaw(state.rawInput);
		html += fallback
			? `<pre class="subagent-fallback">${fallback}</pre>`
			: `<div class="subagent-item-meta">Waiting for subagent updates…</div>`;
	}

	html += `</div>`;

	let panel = card.querySelector(".subagent-panel");
	const body = card.querySelector(".tool-body");
	if (!panel) {
		body.querySelector(".tool-input-section")?.remove();
		body.querySelector(".tool-output-section")?.remove();
		body.insertAdjacentHTML("afterbegin", html);
	} else {
		panel.outerHTML = html;
	}
}

function syncSubagentToolCard(state) {
	const card = state.el;
	const details = parseSubagentDetails(state.rawOutput);
	const toolRunning = ["running", "in_progress", "pending"].includes(normalizeStatus(state.status));

	card.classList.add("tool-card--subagent");
	card.querySelector(".tool-name").textContent = subagentHeaderLabel(details, state.rawInput);

	const statusBadge = card.querySelector(".tool-status");
	const subagentStatus = subagentStatusLabel(details, toolRunning);
	statusBadge.className = `tool-status tool-status-${toolRunning ? "running" : normalizeStatus(state.status)}`;
	statusBadge.textContent = subagentStatus;

	renderSubagentPanel(state);

	if (toolRunning) {
		card.classList.add("expanded");
		card.querySelector(".tool-header")?.setAttribute("aria-expanded", "true");
	}
}

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
		const state = app.toolCards.get(id);
		if (state && isSubagentTool(state)) renderSubagentPanel(state);
	});

	appendChatNode(card, { beforeStreaming: !app.batchHistoryMode });
	animateEnter(card, "anim-fade-up");

	const state = { el: card, title: null, toolName: null, kind: null, rawInput: null, rawOutput: null, status: "running" };
	app.toolCards.set(id, state);
	return state;
}

export function updateToolCard(msg) {
	const id = msg.id;
	if (!id) return;

	let state = app.toolCards.get(id);
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
