import { syncComposerHighlight } from "./highlight.js";

export function resizeTextarea(el) {
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
	syncComposerHighlight(el);
}
