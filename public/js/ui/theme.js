import { app } from "../state/store.js";
import { THEME_PREF_KEY } from "../config.js";

export const THEME_MODES = ["system", "dark", "light"];

const THEME_LABELS = {
	system: "System",
	dark: "Dark",
	light: "Light",
};

function loadThemeMode() {
	try {
		const stored = localStorage.getItem(THEME_PREF_KEY);
		if (stored && THEME_MODES.includes(stored)) return stored;
	} catch {
		/* ignore */
	}
	return "system";
}

function resolveTheme(mode) {
	if (mode === "light" || mode === "dark") return mode;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode) {
	const resolved = resolveTheme(mode);
	document.documentElement.dataset.themeMode = mode;
	document.documentElement.dataset.theme = resolved;
}

async function refreshThemeSurfaces() {
	const { onThemeChange } = await import("../utils/mermaid.js");
	onThemeChange();
	const { renderSessions } = await import("../dashboard/sessions.js");
	renderSessions();
}

function showThemeToast(mode) {
	let toast = document.getElementById("theme-toast");
	if (!toast) {
		toast = document.createElement("div");
		toast.id = "theme-toast";
		toast.className = "art-style-toast";
		document.body.appendChild(toast);
	}

	const label = THEME_LABELS[mode] ?? mode;
	toast.textContent = `Theme: ${label} · Ctrl+Shift+L to cycle`;
	toast.classList.add("visible");
	clearTimeout(app.ui.themeToastTimer);
	app.ui.themeToastTimer = setTimeout(() => toast.classList.remove("visible"), 2000);
}

export function getResolvedTheme() {
	return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function initTheme() {
	app.ui.themeMode = loadThemeMode();
	applyTheme(app.ui.themeMode);

	window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
		if (app.ui.themeMode === "system") {
			applyTheme("system");
			void refreshThemeSurfaces();
		}
	});
}

export async function cycleTheme() {
	const idx = THEME_MODES.indexOf(app.ui.themeMode);
	app.ui.themeMode = THEME_MODES[(idx + 1) % THEME_MODES.length];
	try {
		localStorage.setItem(THEME_PREF_KEY, app.ui.themeMode);
	} catch {
		/* ignore */
	}
	applyTheme(app.ui.themeMode);
	showThemeToast(app.ui.themeMode);
	await refreshThemeSurfaces();
}
