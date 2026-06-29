import { icon } from "../icons/hover-icons.js";

const COMPOSER_ICONS = {
	fileRef: () => icon("file-description", { size: 18 }),
	attach: () => icon("camera", { size: 18 }),
	send: () => icon("send", { size: 20, className: "composer-send" }),
	stop: () => icon("stop", { size: 16 }),
};

export function applySharedComposerIcons() {
	for (const btn of document.querySelectorAll("[data-composer-icon]")) {
		const render = COMPOSER_ICONS[btn.dataset.composerIcon];
		if (render) btn.innerHTML = render();
	}
}
