import { app } from "../state/store.js";

export function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function animateEnter(el, className = "anim-fade-up", { delay = 0 } = {}) {
	if (!el || app.batchHistoryMode || prefersReducedMotion()) return;
	if (delay > 0) el.style.animationDelay = `${delay}ms`;
	el.classList.add(className);
	el.addEventListener(
		"animationend",
		() => {
			el.classList.remove(className);
			el.style.animationDelay = "";
		},
		{ once: true },
	);
}
