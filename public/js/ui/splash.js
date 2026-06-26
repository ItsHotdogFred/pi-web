/** @type {HTMLElement | null} */
let splashEl = null;
/** @type {HTMLElement | null} */
let splashStatusEl = null;
/** @type {HTMLElement | null} */
let appEl = null;

export function initSplash() {
	splashEl = document.getElementById("startup-splash");
	splashStatusEl = document.getElementById("startup-splash-status");
	appEl = document.querySelector(".app.app--booting");

	const gridEl = document.getElementById("startup-skeleton-contrib");
	if (gridEl && !gridEl.childElementCount) {
		for (let week = 0; week < 26; week += 1) {
			const column = document.createElement("div");
			column.className = "skeleton-contrib-week";
			for (let day = 0; day < 7; day += 1) {
				const cell = document.createElement("div");
				cell.className = "skeleton-block skeleton-contrib-cell";
				column.appendChild(cell);
			}
			gridEl.appendChild(column);
		}
	}
}

export function setSplashStatus(text) {
	if (splashStatusEl) splashStatusEl.textContent = text;
}

export function dismissSplash() {
	if (!splashEl || splashEl.classList.contains("startup-splash--hidden")) return;

	splashEl.classList.add("startup-splash--hidden");
	appEl?.classList.remove("app--booting");

	const remove = () => {
		splashEl?.remove();
		splashEl = null;
		splashStatusEl = null;
	};
	splashEl.addEventListener("transitionend", remove, { once: true });
	setTimeout(remove, 500);
}
