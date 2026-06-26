import { app } from "../state/store.js";
import { CONTEXT_DIAL_CIRCUMFERENCE } from "../config.js";
import {
	$,
	contextDialWrapEl,
	contextDialTriggerEl,
	contextPopoverEl,
	contextBreakdownEl,
	contextPopoverSummaryEl,
	contextActionsEl,
	contextCompactBtnEl,
	contextNewSessionBtnEl,
} from "../dom/elements.js";
import { formatTokenCount, formatBreakdownTokenCount } from "../utils/format.js";
import { setStatus } from "../ui/status.js";

function contextDialLevel(percent) {
	if (percent == null) return "unknown";
	if (percent > 90) return "high";
	if (percent > 70) return "medium";
	return "low";
}

function renderContextBreakdown(breakdown, windowSize) {
	if (!contextBreakdownEl) return;
	contextBreakdownEl.replaceChildren();

	const items = Array.isArray(breakdown) ? breakdown : [];
	if (items.length === 0) {
		const empty = document.createElement("li");
		empty.className = "context-breakdown-empty";
		empty.textContent = "No breakdown available yet";
		contextBreakdownEl.appendChild(empty);
		return;
	}

	const basis =
		windowSize && windowSize > 0
			? windowSize
			: items.reduce((sum, item) => sum + (item.tokens ?? 0), 0);

	for (const item of items) {
		const li = document.createElement("li");
		li.className = "context-breakdown-item";

		const label = document.createElement("span");
		label.className = "context-breakdown-label";
		label.textContent = item.label ?? item.id ?? "Other";
		if (item.source) label.title = item.source;

		const bar = document.createElement("span");
		bar.className = "context-breakdown-bar";
		const fill = document.createElement("span");
		const pct = basis > 0 ? Math.min(100, ((item.tokens ?? 0) / basis) * 100) : 0;
		fill.style.width = `${pct}%`;
		bar.appendChild(fill);

		const value = document.createElement("span");
		value.className = "context-breakdown-value";
		value.textContent = formatBreakdownTokenCount(item.tokens);

		li.append(label, bar, value);
		contextBreakdownEl.appendChild(li);
	}
}

function setContextPopoverOpen(open) {
	if (!contextDialWrapEl || !contextPopoverEl || !contextDialTriggerEl) return;
	contextDialWrapEl.classList.toggle("is-open", open);
	contextPopoverEl.classList.toggle("hidden", !open);
	contextDialTriggerEl.setAttribute("aria-expanded", String(open));
}

export function renderContextUsage() {
	if (!contextDialWrapEl) return;

	const { used, size, percent, breakdown } = app.contextUsage;
	const show = Boolean(app.sessionId && app.currentView === "chat");
	contextDialWrapEl.classList.toggle("hidden", !show);
	if (!show) {
		setContextPopoverOpen(false);
		return;
	}

	const level = contextDialLevel(percent);
	contextDialWrapEl.classList.remove("context-dial--low", "context-dial--medium", "context-dial--high", "context-dial--unknown");
	contextDialWrapEl.classList.add(`context-dial--${level}`);

	const fill = contextDialWrapEl.querySelector(".context-dial-fill");
	if (fill) {
		const pct = percent == null ? 0 : Math.min(Math.max(percent, 0), 100);
		fill.style.strokeDashoffset = String(CONTEXT_DIAL_CIRCUMFERENCE * (1 - pct / 100));
	}

	const labelEl = $("context-dial-label");
	if (labelEl) labelEl.textContent = percent == null ? "—" : `${percent.toFixed(0)}%`;

	if (contextPopoverSummaryEl) {
		const usedLabel = used == null ? "?" : formatTokenCount(used);
		const sizeLabel = size == null ? "?" : formatTokenCount(size);
		contextPopoverSummaryEl.textContent = `${usedLabel} / ${sizeLabel}`;
	}

	renderContextBreakdown(breakdown, size);

	if (contextActionsEl) {
		const showActions =
			Boolean(app.sessionId) && app.currentView === "chat" && percent != null && percent >= 70;
		contextActionsEl.classList.toggle("hidden", !showActions);
		contextActionsEl.classList.toggle("context-actions--high", level === "high");
	}

	if (contextCompactBtnEl) {
		const compacting = app.contextCompactPending && app.busy;
		contextCompactBtnEl.disabled = app.busy || app.creatingSession || app.contextCompactPending;
		contextCompactBtnEl.textContent = compacting ? "Compacting…" : "Compact now";
	}

	if (contextNewSessionBtnEl) {
		contextNewSessionBtnEl.disabled = app.busy || app.creatingSession;
	}
}

export function setContextUsage(next) {
	const prev = app.contextUsage;
	const used = next?.used ?? prev.used ?? null;
	const size = next?.size ?? prev.size ?? null;
	let percent = next?.percent ?? prev.percent ?? null;
	const breakdown =
		Array.isArray(next?.breakdown) && next.breakdown.length > 0 ? next.breakdown : (prev.breakdown ?? []);
	if (percent == null && used != null && size != null && size > 0) {
		percent = (used / size) * 100;
	}
	app.contextUsage = { used, size, percent, breakdown };
	renderContextUsage();
}

export function resetContextUsage() {
	setContextUsage({ used: null, size: null, percent: null, breakdown: [] });
}

export function initContextDialPopover() {
	if (!contextDialWrapEl || !contextPopoverEl) return;

	const openPopover = () => {
		clearTimeout(app.contextPopoverTimer);
		setContextPopoverOpen(true);
	};

	const closePopover = () => {
		clearTimeout(app.contextPopoverTimer);
		app.contextPopoverTimer = setTimeout(() => setContextPopoverOpen(false), 120);
	};

	contextDialWrapEl.addEventListener("mouseenter", openPopover);
	contextDialWrapEl.addEventListener("mouseleave", closePopover);
	contextDialWrapEl.addEventListener("focusin", openPopover);
	contextDialWrapEl.addEventListener("focusout", (event) => {
		if (!contextDialWrapEl.contains(event.relatedTarget)) closePopover();
	});

	contextCompactBtnEl?.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!app.ws || app.ws.readyState !== WebSocket.OPEN || app.busy || app.creatingSession || app.contextCompactPending) return;
		app.contextCompactPending = true;
		renderContextUsage();
		setStatus("busy");
		app.ws.send(JSON.stringify({ type: "compact" }));
	});

	contextNewSessionBtnEl?.addEventListener("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();
		if (!app.ws || app.ws.readyState !== WebSocket.OPEN || app.busy || app.creatingSession) return;
		const percent = app.contextUsage.percent ?? 0;
		if (percent < 90) {
			const ok = confirm("Start a fresh session? Your current conversation will remain in history.");
			if (!ok) return;
		}
		const { newSession } = await import("../dashboard/sessions.js");
		newSession();
	});
}
