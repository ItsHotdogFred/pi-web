import { app } from "../state/store.js";
import { sessionTitle } from "../dashboard/sessionHelpers.js";

const DEFAULT_TITLE = "pi-web";
const FLASH_MS = 3000;
const ORIGINAL_FAVICON = "/favicon.svg";
const FAVICON_SIZE = 32;

/** @type {"idle"|"working"|"done"|"permission"|"error"} */
let currentState = "idle";
let flashTimer = null;
let baseTitle = DEFAULT_TITLE;
/** @type {HTMLLinkElement|null} */
let faviconLink = null;
/** @type {HTMLImageElement|null} */
let faviconImage = null;
let faviconLoaded = false;

const TITLE_BY_STATE = {
	idle: (base) => base,
	working: (base) => `● Working… — ${base}`,
	done: (base) => `✓ Done — ${base}`,
	permission: (base) => `⚠ Permission needed — ${base}`,
	error: (base) => `⚠ Error — ${base}`,
};

const BADGE_COLOR = {
	working: "#f59e0b",
	done: "#22c55e",
	permission: "#f59e0b",
	error: "#ef4444",
};

function resolveBaseTitle() {
	if (app.ui.currentView === "chat" && app.session.sessionId) {
		const active = app.session.sessions.find((s) => s.sessionId === app.session.sessionId);
		if (active) return sessionTitle(active);
		return "New Agent";
	}
	return DEFAULT_TITLE;
}

function getFaviconLink() {
	if (!faviconLink) faviconLink = document.querySelector('link[rel="icon"]');
	return faviconLink;
}

function loadFaviconImage() {
	if (faviconLoaded || faviconImage) return Promise.resolve();
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			faviconImage = img;
			faviconLoaded = true;
			resolve();
		};
		img.onerror = () => resolve();
		img.src = ORIGINAL_FAVICON;
	});
}

function badgeDataUrl(state) {
	const color = BADGE_COLOR[state];
	if (!color) return null;

	const canvas = document.createElement("canvas");
	canvas.width = FAVICON_SIZE;
	canvas.height = FAVICON_SIZE;
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;

	if (faviconImage) {
		ctx.drawImage(faviconImage, 0, 0, FAVICON_SIZE, FAVICON_SIZE);
	} else {
		ctx.fillStyle = "#09090b";
		ctx.beginPath();
		ctx.roundRect(0, 0, FAVICON_SIZE, FAVICON_SIZE, 4);
		ctx.fill();
	}

	const r = 5;
	const cx = FAVICON_SIZE - r - 2;
	const cy = FAVICON_SIZE - r - 2;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "#09090b";
	ctx.lineWidth = 1.5;
	ctx.stroke();

	return canvas.toDataURL("image/png");
}

function restoreFavicon() {
	const link = getFaviconLink();
	if (link) link.href = ORIGINAL_FAVICON;
}

function shouldBadgeFavicon() {
	return document.hidden && currentState !== "idle";
}

function applyFavicon() {
	const link = getFaviconLink();
	if (!link) return;

	if (!shouldBadgeFavicon()) {
		restoreFavicon();
		return;
	}

	const dataUrl = badgeDataUrl(currentState);
	if (dataUrl) link.href = dataUrl;
	else restoreFavicon();
}

function applyTitle() {
	const format = TITLE_BY_STATE[currentState] ?? TITLE_BY_STATE.idle;
	document.title = format(baseTitle);
}

function applyTabDisplay() {
	baseTitle = resolveBaseTitle();
	applyTitle();
	void loadFaviconImage().then(applyFavicon);
}

function resolveIdleState() {
	if (app.permissions.activeRequest || app.permissions.queue.length > 0) return "permission";
	if (app.ui.busy) return "working";
	return "idle";
}

export function refreshTabBaseTitle() {
	baseTitle = resolveBaseTitle();
	applyTitle();
}

/** @param {"idle"|"working"|"done"|"permission"|"error"} state */
export function setTabStatus(state) {
	if (flashTimer) {
		clearTimeout(flashTimer);
		flashTimer = null;
	}
	currentState = state;
	applyTabDisplay();
}

/** @param {"done"} state */
export function flashTabStatus(state) {
	setTabStatus(state);
	flashTimer = setTimeout(() => {
		flashTimer = null;
		setTabStatus(resolveIdleState());
	}, FLASH_MS);
}

export function clearTabPermissionStatus() {
	if (app.permissions.activeRequest || app.permissions.queue.length > 0) return;
	setTabStatus(resolveIdleState());
}

export function clearTabErrorStatus() {
	if (currentState !== "error") return;
	setTabStatus(resolveIdleState());
}

export function initTabStatus() {
	baseTitle = document.title.trim() || DEFAULT_TITLE;
	baseTitle = resolveBaseTitle();

	document.addEventListener("visibilitychange", () => {
		applyFavicon();
	});

	void loadFaviconImage();
	applyTabDisplay();
}
