import { app } from "../state/store.js";
import {
	formatRaw,
	parseRawObject,
	normalizeStatus,
	truncateText,
} from "../utils/format.js";
import {
	resolveToolName,
	formatSubagentToolCall,
} from "../utils/tools.js";
import { enhanceRenderedMarkdown, renderMarkdown } from "../utils/markdown.js";
import { icon } from "../icons/hover-icons.js";

function subagentStatusIcon(status) {
	if (status === "running") return icon("refresh", { size: 12, spin: true });
	if (status === "failed") return icon("x", { size: 12 });
	return icon("simple-checked", { size: 12 });
}

export function isSubagentTool(state) {
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

function subagentResultCount(details, input) {
	if (details?.results?.length) return details.results.length;
	if (Array.isArray(input?.chain)) return input.chain.length;
	if (Array.isArray(input?.tasks)) return input.tasks.length;
	if (input?.agent) return 1;
	return 0;
}

function subagentLayoutMode(details, input) {
	if (details?.mode) return details.mode;
	if (Array.isArray(input?.chain)) return "chain";
	if (Array.isArray(input?.tasks)) return "parallel";
	return null;
}

function defaultSubagentView(details, input) {
	const count = subagentResultCount(details, input);
	const mode = subagentLayoutMode(details, input);
	if (count >= 2 && (mode === "parallel" || mode === "chain")) return "swimlane";
	return "list";
}

function getSubagentViewMode(card, details, input) {
	const stored = card.dataset.subagentView;
	if (stored === "list" || stored === "swimlane") return stored;
	return defaultSubagentView(details, input);
}

function renderSubagentViewToggle(viewMode) {
	return `<div class="subagent-view-toggle" role="group" aria-label="Subagent view">
		<button type="button" class="subagent-view-btn${viewMode === "list" ? " is-active" : ""}" data-view="list">List</button>
		<button type="button" class="subagent-view-btn${viewMode === "swimlane" ? " is-active" : ""}" data-view="swimlane">Swimlane</button>
	</div>`;
}

function subagentProgressLabel(result, status, items) {
	if (status === "running") {
		if (items.length) return `${items.length} step${items.length === 1 ? "" : "s"}`;
		return "Running…";
	}
	if (status === "failed") {
		return result.errorMessage ? truncateText(result.errorMessage, 80) : "Failed";
	}
	const output = subagentFinalOutput(result);
	if (output) return truncateText(output, 80);
	if (items.length) return `${items.length} step${items.length === 1 ? "" : "s"}`;
	return "Done";
}

function renderSubagentLane(result, toolRunning, expanded, options = {}) {
	const status = subagentResultStatus(result, toolRunning);
	const items = subagentDisplayItems(result.messages);
	const icon = subagentStatusIcon(status);
	const source = result.agentSource ? ` (${result.agentSource})` : "";
	const step = typeof result.step === "number" ? result.step + 1 : null;
	const progress = subagentProgressLabel(result, status, items);
	const stepBadge = options.showStep && step != null ? `<span class="subagent-lane-step">${step}</span>` : "";

	return `<article class="subagent-lane subagent-lane--${status}">
		<div class="subagent-lane-header">
			<span class="subagent-lane-icon" aria-hidden="true">${icon}</span>
			<span class="subagent-lane-name">${result.agent}${source}</span>
			${stepBadge}
		</div>
		<div class="subagent-lane-task">${truncateText(result.task, expanded ? 400 : 120)}</div>
		<div class="subagent-lane-progress">${progress}</div>
	</article>`;
}

function renderSubagentSwimlane(results, mode, toolRunning, expanded) {
	const laneClass = mode === "chain" ? "subagent-swimlane--chain" : "subagent-swimlane--parallel";
	let html = `<div class="subagent-swimlane ${laneClass}">`;
	for (let i = 0; i < results.length; i++) {
		if (mode === "chain" && i > 0) {
			html += `<div class="subagent-lane-connector" aria-hidden="true"><span>→</span></div>`;
		}
		html += renderSubagentLane(results[i], toolRunning, expanded, { showStep: mode === "chain" });
	}
	html += `</div>`;
	return html;
}

function renderSubagentListResults(results, toolRunning, expanded) {
	let html = `<div class="subagent-list">`;
	for (const result of results) {
		html += renderSubagentResult(result, toolRunning, expanded);
	}
	html += `</div>`;
	return html;
}

function bindSubagentViewToggle(card) {
	if (card.dataset.subagentViewBound) return;
	card.dataset.subagentViewBound = "1";
	card.addEventListener("click", (event) => {
		const btn = event.target.closest(".subagent-view-btn");
		if (!btn) return;
		event.stopPropagation();
		const view = btn.dataset.view;
		if (view !== "list" && view !== "swimlane") return;
		card.dataset.subagentView = view;
		const state = app.chat.toolCards.get(card.dataset.toolId);
		if (state) renderSubagentPanel(state);
	});
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
	const icon = subagentStatusIcon(status);
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

export function renderSubagentPanel(state) {
	const card = state.el;
	const details = parseSubagentDetails(state.rawOutput);
	const input = parseRawObject(state.rawInput);
	const toolRunning = ["running", "in_progress", "pending"].includes(normalizeStatus(state.status));
	const expanded = card.classList.contains("expanded");
	const viewMode = getSubagentViewMode(card, details, input);
	const layoutMode = subagentLayoutMode(details, input);
	let html = `<div class="subagent-panel">`;

	if (details) {
		const scope = details.agentScope ? `<span class="subagent-chip">${details.agentScope}</span>` : "";
		html += `<div class="subagent-summary">${scope}<span class="subagent-mode">${details.mode}</span>${renderSubagentViewToggle(viewMode)}</div>`;
		if (viewMode === "swimlane") {
			html += renderSubagentSwimlane(details.results, layoutMode ?? "parallel", toolRunning, expanded);
			if (details.aggregator) {
				html += `<div class="subagent-fanin-label">Fan-in</div>`;
				html += `<div class="subagent-swimlane-fanin">${renderSubagentLane(details.aggregator, toolRunning, expanded)}</div>`;
			}
		} else {
			html += renderSubagentListResults(details.results, toolRunning, expanded);
			if (details.aggregator) {
				html += `<div class="subagent-fanin-label">Fan-in</div>`;
				html += renderSubagentResult(details.aggregator, toolRunning, expanded);
			}
		}
	} else if (input) {
		const pendingResults = [];
		if (Array.isArray(input.chain)) {
			for (const step of input.chain) {
				pendingResults.push({
					agent: step.agent,
					agentSource: "pending",
					task: step.task,
					exitCode: -1,
					messages: [],
				});
			}
		} else if (Array.isArray(input.tasks)) {
			for (const task of input.tasks) {
				pendingResults.push({
					agent: task.agent,
					agentSource: "pending",
					task: task.task,
					exitCode: -1,
					messages: [],
				});
			}
		} else if (input.agent && input.task) {
			pendingResults.push({
				agent: input.agent,
				agentSource: "pending",
				task: input.task,
				exitCode: -1,
				messages: [],
			});
		}

		if (pendingResults.length) {
			const pendingMode = subagentLayoutMode(null, input);
			html += `<div class="subagent-summary">${renderSubagentViewToggle(viewMode)}</div>`;
			if (viewMode === "swimlane") {
				html += renderSubagentSwimlane(pendingResults, pendingMode ?? "parallel", true, expanded);
			} else {
				html += renderSubagentListResults(pendingResults, true, expanded);
			}
		} else {
			html += `<div class="subagent-list"></div>`;
		}
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

	bindSubagentViewToggle(card);
	panel = card.querySelector(".subagent-panel");
	if (panel) enhanceRenderedMarkdown(panel);
}

export function syncSubagentToolCard(state) {
	const card = state.el;
	const details = parseSubagentDetails(state.rawOutput);
	const toolRunning = ["running", "in_progress", "pending"].includes(normalizeStatus(state.status));

	card.classList.add("tool-card--subagent");
	bindSubagentViewToggle(card);
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
