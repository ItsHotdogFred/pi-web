/** Animated icons adapted from https://github.com/itshover/itshover (Apache 2.0) */

function strokeWidth(size) {
	if (size <= 10) return 1.25;
	if (size <= 14) return 1.5;
	if (size <= 18) return 1.75;
	return 2;
}

function wrap(name, size, viewBox, body, { className = "", style = "", spin = false, blink = false } = {}) {
	const mods = ["hi", `hi--${name}`, className];
	if (spin) mods.push("hi--spin");
	if (blink) mods.push("hi--blink");
	const styleAttr = style ? ` style="${style}"` : "";
	return `<span class="${mods.filter(Boolean).join(" ")}"${styleAttr} aria-hidden="true"><svg width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth(size)}" stroke-linecap="round" stroke-linejoin="round">${body}</svg></span>`;
}

function path(d, cls = "") {
	return `<path class="${cls}" d="${d}"/>`;
}

function rect(attrs, cls = "") {
	const parts = Object.entries(attrs)
		.map(([k, v]) => `${k}="${v}"`)
		.join(" ");
	return `<rect class="${cls}" ${parts}/>`;
}

function circle(attrs, cls = "") {
	const parts = Object.entries(attrs)
		.map(([k, v]) => `${k}="${v}"`)
		.join(" ");
	return `<circle class="${cls}" ${parts}/>`;
}

const ICONS = {
	magnifier(size = 16) {
		return wrap(
			"magnifier",
			size,
			"0 0 32 32",
			`<g class="hi-magnifier-group">${path("m21.393,18.565l7.021,7.021c.781.781.781,2.047,0,2.828h0c-.781.781-2.047.781-2.828,0l-7.021-7.021")}${circle({ cx: "13", cy: "13", r: "10" })}</g>`,
		);
	},

	"layout-dashboard"(size = 16) {
		return wrap(
			"layout-dashboard",
			size,
			"0 0 24 24",
			`${rect({ x: "3", y: "3", width: "7", height: "9", rx: "1" }, "hi-dash-1")}${rect({ x: "14", y: "3", width: "7", height: "5", rx: "1" }, "hi-dash-2")}${rect({ x: "14", y: "12", width: "7", height: "9", rx: "1" }, "hi-dash-3")}${rect({ x: "3", y: "16", width: "7", height: "5", rx: "1" }, "hi-dash-4")}`,
		);
	},

	"down-chevron"(size = 10) {
		return wrap("down-chevron", size, "0 0 24 24", path("M6 9l6 6l6 -6", "hi-chevron-path"));
	},

	"arrow-back"(size = 16) {
		return wrap(
			"arrow-back",
			size,
			"0 0 24 24",
			`<g class="hi-arrow-back-group">${path("M9 11l-4 4l4 4m-4 -4h11a4 4 0 0 0 0 -8h-1")}</g>`,
		);
	},

	link(size = 14) {
		return wrap(
			"link",
			size,
			"0 0 24 24",
			`${path("M9 15l6 -6", "hi-link-1")}${path("M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464", "hi-link-2")}${path("M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463", "hi-link-3")}`,
		);
	},

	sparkles(size = 14, opts = {}) {
		return wrap(
			"sparkles",
			size,
			"0 0 24 24",
			`${path("M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z", "hi-sparkle-bottom")}${path("M16 6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2z", "hi-sparkle-top")}${path("M9 18a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z", "hi-sparkle-main")}`,
			opts,
		);
	},

	terminal(size = 14, opts = {}) {
		return wrap(
			"terminal",
			size,
			"0 0 24 24",
			`${path("M5 7l5 5l-5 5", "hi-terminal-chevron")}${path("M12 19l7 0", "hi-terminal-cursor")}`,
			opts,
		);
	},

	refresh(size = 14, opts = {}) {
		return wrap(
			"refresh",
			size,
			"0 0 24 24",
			`<g class="hi-refresh-group">${path("M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4")}${path("M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4")}</g>`,
			opts,
		);
	},

	send(size = 16) {
		return wrap(
			"send",
			size,
			"0 0 24 24",
			`<g class="hi-send-group">${path("M10 14l11 -11")}${path("M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5")}</g>`,
		);
	},

	stop(size = 16) {
		return wrap("stop", size, "0 0 24 24", rect({ x: "7", y: "7", width: "10", height: "10", rx: "1.5", fill: "currentColor", stroke: "none" }, "hi-stop-square"));
	},

	copy(size = 16, opts = {}) {
		return wrap(
			"copy",
			size,
			"0 0 24 24",
			`${path("M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1", "hi-copy-back")}${path("M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z", "hi-copy-front")}`,
			opts,
		);
	},

	camera(size = 18) {
		return wrap("camera", size, "0 0 24 24", path("M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z", "hi-camera-body"));
	},

	"file-description"(size = 18) {
		return wrap(
			"file-description",
			size,
			"0 0 24 24",
			`${path("M14 3v4a1 1 0 0 0 1 1h4")}${path("M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z", "hi-file-body")}${path("M9 17h6", "hi-file-line-2")}${path("M9 13h6", "hi-file-line-1")}`,
		);
	},

	"simple-checked"(size = 10) {
		return wrap("simple-checked", size, "0 0 24 24", path("M5 12l5 5l10 -10", "hi-check-path"));
	},

	checked(size = 10) {
		return wrap(
			"checked",
			size,
			"0 0 24 24",
			`${path("M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0")}${path("M9 12l2 2l4 -4", "hi-check-path")}`,
		);
	},

	clock(size = 10) {
		return wrap(
			"clock",
			size,
			"0 0 24 24",
			`${path("M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0")}<g class="hi-clock-hands">${path("M12 7v5l3 3")}</g>`,
		);
	},

	player(size = 10, opts = {}) {
		return wrap("player", size, "0 0 24 24", path("M6 4v16a1 1 0 0 0 1.524 .852l13 -8a1 1 0 0 0 0 -1.704l-13 -8a1 1 0 0 0 -1.524 .852z", "hi-player-path"), opts);
	},

	"history-circle"(size = 14) {
		return wrap(
			"history-circle",
			size,
			"0 0 24 24",
			`<g class="hi-history-group">${path("M12 8l0 4l2 2")}${path("M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5")}</g>`,
		);
	},

	"unordered-list"(size = 14) {
		return wrap(
			"unordered-list",
			size,
			"0 0 24 24",
			`${path("M9 6l11 0")}${path("M9 12l11 0")}${path("M9 18l11 0")}${path("M5 6l0 .01", "hi-list-dot hi-list-dot-1")}${path("M5 12l0 .01", "hi-list-dot hi-list-dot-2")}${path("M5 18l0 .01", "hi-list-dot hi-list-dot-3")}`,
		);
	},

	pen(size = 14) {
		return wrap(
			"pen",
			size,
			"0 0 32 32",
			`<g class="hi-pen-group">${path("M20 6 L26 12")}${path("m10.5,27.5l-8,2 2-8L22.257,3.743c1.657-1.657,4.343-1.657,6,0s1.657,4.343,0,6L10.5,27.5Z")}</g>`,
		);
	},

	x(size = 12) {
		return wrap("x", size, "0 0 24 24", `<g class="hi-x-group">${path("M18 6l-12 12")}${path("M6 6l12 12")}</g>`);
	},

	"triangle-alert"(size = 12) {
		return wrap(
			"triangle-alert",
			size,
			"0 0 24 24",
			`${path("m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3")}${path("M12 9v4")}${path("M12 17h.01")}`,
		);
	},

	"info-circle"(size = 12) {
		return wrap(
			"info-circle",
			size,
			"0 0 24 24",
			`${path("M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0")}${path("M12 9h.01")}${path("M11 12h1v4h1")}`,
		);
	},

	code(size = 14) {
		return wrap(
			"code",
			size,
			"0 0 24 24",
			`${path("m16 18 6-6-6-6", "hi-code-right")}${path("m8 6-6 6 6 6", "hi-code-left")}`,
		);
	},
};

export function icon(name, opts = {}) {
	const size = opts.size ?? 16;
	const fn = ICONS[name];
	if (!fn) return "";
	const html = fn(size, opts);
	if (opts.className) {
		return html.replace(`hi--${name}"`, `hi--${name} ${opts.className}"`);
	}
	return html;
}

export function bindHoverIcons(root = document) {
	for (const el of root.querySelectorAll("[data-hi]")) {
		const name = el.dataset.hi;
		if (!name) continue;
		const size = el.dataset.hiSize ? Number(el.dataset.hiSize) : undefined;
		const spin = el.dataset.hiSpin === "true";
		const blink = el.dataset.hiBlink === "true";
		const className = el.dataset.hiClass ?? "";
		const style = el.getAttribute("style") ?? "";
		el.innerHTML = icon(name, { size, className, style, spin, blink });
	}
}
