import { app } from "../state/store.js";
import { ACTIVITY_ART_KEY } from "../config.js";
import {
	todayListEl,
	activityFeedEl,
} from "../dom/elements.js";
import { animateEnter } from "../utils/animation.js";
import { formatDateGroupLabel, sessionDateKey } from "../utils/format.js";
import { filteredSessions } from "./sessionHelpers.js";
import { createTodayItem, createActivityCard } from "./sessionRow.js";

const ACTIVITY_ART_STYLES = ["aurora", "identicon", "flow"];
const ACTIVITY_ART_LABELS = {
	aurora: "Aurora",
	identicon: "Identicon",
	flow: "Flow field",
};

function loadActivityArtStyle() {
	try {
		const stored = localStorage.getItem(ACTIVITY_ART_KEY);
		if (stored && ACTIVITY_ART_STYLES.includes(stored)) return stored;
	} catch {
		/* ignore */
	}
	return ACTIVITY_ART_STYLES[0];
}

app.ui.activityArtStyle = loadActivityArtStyle();

function showArtStyleToast(style) {
	let toast = document.getElementById("art-style-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "art-style-toast";
		toast.className = "art-style-toast";
		document.body.appendChild(toast);
	}

	const label = ACTIVITY_ART_LABELS[style] ?? style;
	toast.textContent = `Activity art: ${label} · Ctrl+Shift+G to cycle`;
	toast.classList.add("visible");
	clearTimeout(app.ui.artStyleToastTimer);
	app.ui.artStyleToastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
}

export async function cycleActivityArtStyle() {
	const idx = ACTIVITY_ART_STYLES.indexOf(app.ui.activityArtStyle);
	app.ui.activityArtStyle = ACTIVITY_ART_STYLES[(idx + 1) % ACTIVITY_ART_STYLES.length];
	try {
		localStorage.setItem(ACTIVITY_ART_KEY, app.ui.activityArtStyle);
	} catch {
		/* ignore */
	}
	const { renderSessions } = await import("./sessions.js");
	renderSessions();
	showArtStyleToast(app.ui.activityArtStyle);
}

function renderTodayList() {
	const list = filteredSessions();
	todayListEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("p");
		empty.className = "today-empty";
		empty.textContent = app.ui.searchQuery ? "No matches" : "No agents yet";
		todayListEl.appendChild(empty);
		return;
	}

	let currentDateKey = null;
	let currentGroup = null;

	for (const session of list) {
		const dateKey = sessionDateKey(session.updatedAt) || "unknown";
		if (dateKey !== currentDateKey) {
			currentDateKey = dateKey;
			currentGroup = document.createElement("div");
			currentGroup.className = "session-date-group";

			const heading = document.createElement("h2");
			heading.className = "sidebar-section-title session-date-group-title";
			heading.textContent = formatDateGroupLabel(session.updatedAt);
			currentGroup.append(heading);

			const items = document.createElement("div");
			items.className = "session-date-group-items";
			currentGroup.append(items);
			todayListEl.appendChild(currentGroup);
		}

		currentGroup.querySelector(".session-date-group-items").appendChild(createTodayItem(session));
	}
}

export function renderActivityFeed() {
	const list = filteredSessions();
	activityFeedEl.replaceChildren();

	if (list.length === 0) {
		const empty = document.createElement("div");
		empty.className = "activity-empty";
		empty.textContent = app.ui.searchQuery ? "No matching agents" : "No recent activity — ask Pi above";
		activityFeedEl.appendChild(empty);
		return;
	}

	for (let i = 0; i < list.length; i++) {
		const card = createActivityCard(list[i]);
		activityFeedEl.appendChild(card);

		if (app.ui.animateActivityFeed) {
			animateEnter(card, "anim-fade-up", { delay: i * 40 });
		}
	}

	app.ui.animateActivityFeed = false;
}

export { renderTodayList };
