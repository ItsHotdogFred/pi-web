import { app } from "../state/store.js";
import { CONTRIB_MONTHS } from "../config.js";
import {
	contribGraphCountEl,
	contribGraphWeeksEl,
	contribGraphMonthsEl,
} from "../dom/elements.js";

function contributionLevel(count) {
	if (count <= 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	if (count <= 6) return 3;
	return 4;
}

function formatContributionTooltip(dateKey, count) {
	const date = new Date(`${dateKey}T12:00:00Z`);
	const label = date.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	});
	const noun = count === 1 ? "contribution" : "contributions";
	return count > 0 ? `${count} ${noun} on ${label}` : `No contributions on ${label}`;
}

function buildHeatmapWeeks(dayData, rangeStart, rangeEnd) {
	const start = new Date(`${rangeStart}T00:00:00Z`);
	const end = new Date(`${rangeEnd}T00:00:00Z`);
	const gridStart = new Date(start);
	gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

	const weeks = [];
	const cursor = new Date(gridStart);

	while (true) {
		const week = [];
		for (let day = 0; day < 7; day += 1) {
			const key = cursor.toISOString().slice(0, 10);
			const inRange = cursor >= start && cursor <= end;
			week.push({
				date: key,
				count: inRange ? (dayData[key] ?? 0) : 0,
				inRange,
				future: cursor > end,
			});
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
		weeks.push(week);
		if (cursor > end) break;
	}

	return weeks;
}

function renderContributionGraph(payload) {
	if (!contribGraphWeeksEl || !contribGraphCountEl) return;

	const dayData = payload?.days && typeof payload.days === "object" ? payload.days : {};
	const total = typeof payload?.total === "number" ? payload.total : 0;
	const rangeStart = payload?.start ?? Object.keys(dayData).sort()[0];
	const rangeEnd = payload?.end ?? Object.keys(dayData).sort().at(-1);

	if (!rangeStart || !rangeEnd) {
		contribGraphCountEl.textContent = "No contribution data yet";
		contribGraphWeeksEl.replaceChildren();
		if (contribGraphMonthsEl) contribGraphMonthsEl.replaceChildren();
		return;
	}

	contribGraphCountEl.innerHTML = `<strong>${total.toLocaleString()}</strong> contribution${total === 1 ? "" : "s"} in the last year`;

	const weeks = buildHeatmapWeeks(dayData, rangeStart, rangeEnd);
	contribGraphWeeksEl.replaceChildren();

	if (contribGraphMonthsEl) {
		contribGraphMonthsEl.replaceChildren();
		let lastMonth = -1;
		for (const week of weeks) {
			const monthEl = document.createElement("span");
			monthEl.className = "contrib-graph-month";
			monthEl.style.width = "14px";
			const firstInRange = week.find((day) => day.inRange);
			if (firstInRange) {
				const month = new Date(`${firstInRange.date}T12:00:00Z`).getUTCMonth();
				if (month !== lastMonth) {
					monthEl.textContent = CONTRIB_MONTHS[month];
					lastMonth = month;
				}
			}
			contribGraphMonthsEl.appendChild(monthEl);
		}
	}

	for (const week of weeks) {
		const weekEl = document.createElement("div");
		weekEl.className = "contrib-graph-week";

		for (const day of week) {
			const cell = document.createElement("span");
			cell.className = "contrib-cell";
			if (!day.inRange || day.future) {
				cell.classList.add("is-future");
			} else {
				cell.classList.add(`level-${contributionLevel(day.count)}`);
				cell.title = formatContributionTooltip(day.date, day.count);
			}
			weekEl.appendChild(cell);
		}

		contribGraphWeeksEl.appendChild(weekEl);
	}
}

export async function loadContributions({ refresh = false } = {}) {
	if (!contribGraphWeeksEl || app.contributionsLoading) return;

	const requestId = ++app.contributionsRequestId;
	app.contributionsLoading = true;

	try {
		const params = new URLSearchParams();
		if (app.cwd) params.set("cwd", app.cwd);
		if (refresh) params.set("refresh", "1");
		const query = params.toString();
		const response = await fetch(`/api/contributions${query ? `?${query}` : ""}`);
		if (!response.ok) throw new Error("Failed to load contributions");
		const payload = await response.json();
		if (requestId !== app.contributionsRequestId) return;
		renderContributionGraph(payload);
	} catch {
		if (requestId !== app.contributionsRequestId) return;
		if (contribGraphCountEl) contribGraphCountEl.textContent = "Could not load contribution activity";
	} finally {
		if (requestId === app.contributionsRequestId) app.contributionsLoading = false;
	}
}
