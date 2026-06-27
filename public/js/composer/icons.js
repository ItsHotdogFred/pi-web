export const COMPOSER_ICONS = {
	fileRef: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<path d="M4 6.5h10M4 9h7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
		<path d="M12.5 3.5c1.2 0 2 1 2 2.2V12.5c0 1.2-.8 2.2-2 2.2H5.5c-1.2 0-2-1-2-2.2V5.7c0-1.2.8-2.2 2-2.2h7Z" stroke="currentColor" stroke-width="1.25" />
		<path d="M12 6.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
	</svg>`,
	attach: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
		<rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.25" />
		<circle cx="6.5" cy="7.5" r="1.5" stroke="currentColor" stroke-width="1.1" />
		<path d="M2 12l4-3.5 3 2.5 3-2.5 4 3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" />
	</svg>`,
	send: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<path d="M8 14V3M8 3l-4 4M8 3l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
	</svg>`,
	stop: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
		<rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
	</svg>`,
};

export function applySharedComposerIcons() {
	for (const btn of document.querySelectorAll("[data-composer-icon]")) {
		const icon = COMPOSER_ICONS[btn.dataset.composerIcon];
		if (icon) btn.innerHTML = icon;
	}
}
