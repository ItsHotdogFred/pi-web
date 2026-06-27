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
import { renderMarkdown } from "../utils/markdown.js";

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

export function renderSubagentPanel(state) {
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

export function syncSubagentToolCard(state) {
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
