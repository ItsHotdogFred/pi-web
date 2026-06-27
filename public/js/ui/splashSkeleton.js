/** @param {string} tag @param {string} [className] @param {Record<string, string>} [attrs] */
function el(tag, className, attrs = {}) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
	return node;
}

function buildActivityCard() {
	const card = el("div", "skeleton-activity-card");
	card.appendChild(el("div", "skeleton-block skeleton-activity-art"));
	const body = el("div", "skeleton-activity-body");
	body.appendChild(el("div", "skeleton-block skeleton-activity-line skeleton-activity-line--title"));
	body.appendChild(el("div", "skeleton-block skeleton-activity-line skeleton-activity-line--meta"));
	card.appendChild(body);
	return card;
}

export function buildSplashSkeleton() {
	const app = el("div", "app");

	const sidebar = el("aside", "sidebar", { "aria-hidden": "true" });
	const sidebarTop = el("div", "sidebar-top");
	sidebarTop.appendChild(el("div", "skeleton-block skeleton-icon-btn"));
	sidebar.appendChild(sidebarTop);

	const nav = el("nav", "sidebar-nav");
	nav.appendChild(el("div", "skeleton-block skeleton-nav-item"));
	sidebar.appendChild(nav);

	const section = el("section", "sidebar-section");
	section.appendChild(el("div", "skeleton-block skeleton-section-title"));
	for (let i = 0; i < 3; i += 1) section.appendChild(el("div", "skeleton-block skeleton-today-item"));
	sidebar.appendChild(section);
	app.appendChild(sidebar);

	const main = el("main", "main");
	const view = el("div", "view view-dashboard");

	const header = el("header", "page-header");
	const chips = el("div", "context-chips");
	chips.appendChild(el("div", "skeleton-block skeleton-chip"));
	chips.appendChild(el("div", "skeleton-block skeleton-chip skeleton-chip--short"));
	header.appendChild(chips);

	const status = el("div", "connection-status status-connecting");
	status.appendChild(el("span", "status-dot", { "aria-hidden": "true" }));
	const statusLabel = el("span");
	statusLabel.id = "startup-splash-status";
	statusLabel.textContent = "Loading…";
	status.appendChild(statusLabel);
	header.appendChild(status);
	view.appendChild(header);

	const body = el("div", "dashboard-body");

	const composer = el("div", "skeleton-composer");
	composer.appendChild(el("div", "skeleton-block skeleton-composer-input"));
	const composerBar = el("div", "skeleton-composer-bar");
	composerBar.appendChild(el("div", "skeleton-block skeleton-pill"));
	const composerActions = el("div", "skeleton-composer-actions");
	composerActions.appendChild(el("div", "skeleton-block skeleton-icon-btn"));
	composerActions.appendChild(el("div", "skeleton-block skeleton-send-btn"));
	composerBar.appendChild(composerActions);
	composer.appendChild(composerBar);
	body.appendChild(composer);

	body.appendChild(el("div", "skeleton-block skeleton-commands-hint"));

	const contrib = el("div", "skeleton-contrib");
	contrib.appendChild(el("div", "skeleton-block skeleton-contrib-title"));
	contrib.appendChild(el("div", "skeleton-contrib-grid", { id: "startup-skeleton-contrib", "aria-hidden": "true" }));
	body.appendChild(contrib);

	const activity = el("div", "skeleton-activity", { "aria-hidden": "true" });
	for (let i = 0; i < 3; i += 1) activity.appendChild(buildActivityCard());
	body.appendChild(activity);

	view.appendChild(body);
	main.appendChild(view);
	app.appendChild(main);

	return app;
}
