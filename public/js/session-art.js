/* Seeded generative art for activity card thumbnails */

function mulberry32(seed) {
	return function () {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hsla(h, s, l, a) {
	return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

function addGrain(ctx, canvas, seed, intensity = 0.03) {
	const rng = mulberry32(seed ^ 0x5bd1e995);
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = imageData.data;
	for (let i = 0; i < data.length; i += 4) {
		const n = (rng() - 0.5) * 255 * intensity;
		data[i] = Math.min(255, Math.max(0, data[i] + n));
		data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + n));
		data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + n));
	}
	ctx.putImageData(imageData, 0, 0);
}

function auroraPalette(seed, rng) {
	const families = [
		[262, 288, 210],
		[168, 192, 248],
		[132, 168, 198],
		[24, 48, 312],
		[330, 280, 190],
		[200, 260, 320],
	];
	const base = families[seed % families.length];
	const twist = Math.floor(rng() * 14) - 7;
	return base.map((h, i) => ({
		h: (h + twist + i * 6) % 360,
		s: 70 + Math.floor(rng() * 22),
		l: 50 + Math.floor(rng() * 14),
	}));
}

function drawAuroraBlob(ctx, x, y, rx, ry, rot, color, alpha) {
	const peak = Math.max(rx, ry) * 1.75;
	const grad = ctx.createRadialGradient(x, y, peak * 0.08, x, y, peak);
	grad.addColorStop(0, hsla(color.h, color.s, color.l, alpha * 0.22));
	grad.addColorStop(0.18, hsla(color.h, color.s * 0.96, color.l * 0.92, alpha * 0.42));
	grad.addColorStop(0.38, hsla(color.h, color.s * 0.92, color.l * 0.88, alpha * 0.32));
	grad.addColorStop(0.58, hsla(color.h, color.s * 0.85, color.l * 0.82, alpha * 0.18));
	grad.addColorStop(0.76, hsla((color.h + 12) % 360, color.s * 0.78, color.l * 0.76, alpha * 0.08));
	grad.addColorStop(0.9, hsla(color.h, color.s * 0.7, color.l * 0.72, alpha * 0.025));
	grad.addColorStop(1, hsla(color.h, color.s, color.l, 0));
	ctx.fillStyle = grad;
	ctx.beginPath();
	ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
	ctx.fill();
}

function renderAurora(seed, width, height) {
	const canvas = document.createElement("canvas");
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);

	const ctx = canvas.getContext("2d");
	ctx.scale(dpr, dpr);

	const rng = mulberry32(seed);
	const palette = auroraPalette(seed, rng);

	const baseGrad = ctx.createLinearGradient(0, 0, width * 0.15, height);
	baseGrad.addColorStop(0, hsla(palette[0].h, 34, 9, 1));
	baseGrad.addColorStop(0.35, hsla(palette[0].h, 30, 7, 1));
	baseGrad.addColorStop(0.7, hsla(palette[1].h, 28, 6, 1));
	baseGrad.addColorStop(1, hsla(palette[2].h, 24, 4, 1));
	ctx.fillStyle = baseGrad;
	ctx.fillRect(0, 0, width, height);

	const blobCanvas = document.createElement("canvas");
	blobCanvas.width = canvas.width;
	blobCanvas.height = canvas.height;
	const blobCtx = blobCanvas.getContext("2d");
	blobCtx.scale(dpr, dpr);
	blobCtx.globalCompositeOperation = "screen";

	const blobCount = 5 + Math.floor(rng() * 2);
	for (let i = 0; i < blobCount; i++) {
		const color = palette[i % palette.length];
		const x = -width * 0.15 + rng() * width * 1.3;
		const y = -height * 0.18 + rng() * height * 1.36;
		const rx = width * (0.32 + rng() * 0.42);
		const ry = height * (0.38 + rng() * 0.48);
		const alpha = 0.14 + rng() * 0.12;
		drawAuroraBlob(blobCtx, x, y, rx, ry, rng() * Math.PI, color, alpha);
	}

	ctx.save();
	ctx.filter = "blur(14px)";
	ctx.globalCompositeOperation = "screen";
	ctx.drawImage(blobCanvas, 0, 0, width, height);
	ctx.restore();

	ctx.globalCompositeOperation = "soft-light";
	const sweep = ctx.createLinearGradient(0, height * 0.02, width, height * 0.98);
	sweep.addColorStop(0, hsla(palette[2].h, 50, 40, 0.04));
	sweep.addColorStop(0.25, hsla(palette[2].h, 55, 42, 0.07));
	sweep.addColorStop(0.45, hsla(palette[0].h, 80, 58, 0.1));
	sweep.addColorStop(0.55, hsla(palette[1].h, 85, 62, 0.09));
	sweep.addColorStop(0.75, hsla(palette[0].h, 70, 52, 0.06));
	sweep.addColorStop(1, hsla(palette[2].h, 45, 34, 0.04));
	ctx.fillStyle = sweep;
	ctx.fillRect(0, 0, width, height);

	ctx.globalCompositeOperation = "source-over";
	const vig = ctx.createRadialGradient(
		width * 0.48,
		height * 0.52,
		Math.min(width, height) * 0.05,
		width * 0.5,
		height * 0.55,
		Math.max(width, height) * 0.92,
	);
	vig.addColorStop(0, "transparent");
	vig.addColorStop(0.55, "rgba(0, 0, 0, 0.06)");
	vig.addColorStop(0.82, "rgba(0, 0, 0, 0.22)");
	vig.addColorStop(1, "rgba(0, 0, 0, 0.58)");
	ctx.fillStyle = vig;
	ctx.fillRect(0, 0, width, height);

	addGrain(ctx, canvas, seed, 0.022);

	return { type: "canvas", element: canvas };
}

function renderIdenticon(seed) {
	const rng = mulberry32(seed);
	const grid = 5;
	const cell = 20;
	const view = grid * cell;
	const colors = [
		`hsl(${seed % 360}, 58%, 48%)`,
		`hsl(${(seed * 3) % 360}, 52%, 58%)`,
		`hsl(${(seed * 7) % 360}, 38%, 32%)`,
	];
	let shapes = `<rect width="${view}" height="${view}" fill="hsl(${(seed + 120) % 360}, 22%, 10%)"/>`;

	for (let row = 0; row < grid; row++) {
		for (let col = 0; col < Math.ceil(grid / 2); col++) {
			const mirrorCol = grid - 1 - col;
			const variant = Math.floor(rng() * 4);
			if (variant === 0) continue;

			const cols = col === mirrorCol ? [col] : [col, mirrorCol];
			for (const c of cols) {
				const x = c * cell + 2;
				const y = row * cell + 2;
				const s = cell - 4;
				const fill = colors[variant - 1];

				if (variant === 1) {
					shapes += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="3" fill="${fill}"/>`;
				} else if (variant === 2) {
					shapes += `<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${fill}"/>`;
				} else {
					shapes += `<polygon points="${x + 2},${y + s} ${x + s},${y + 2} ${x + s},${y + s}" fill="${fill}"/>`;
				}
			}
		}
	}

	return {
		type: "svg",
		html: `<svg viewBox="0 0 ${view} ${view}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${shapes}</svg>`,
	};
}

function renderFlow(seed, width, height) {
	const canvas = document.createElement("canvas");
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	canvas.width = Math.round(width * dpr);
	canvas.height = Math.round(height * dpr);

	const ctx = canvas.getContext("2d");
	ctx.scale(dpr, dpr);

	const hue = seed % 360;
	ctx.fillStyle = `hsl(${hue}, 22%, 7%)`;
	ctx.fillRect(0, 0, width, height);

	const rng = mulberry32(seed);
	const freq = 0.009 + rng() * 0.014;
	const phase = rng() * Math.PI * 2;
	const count = 9 + Math.floor(rng() * 8);

	for (let p = 0; p < count; p++) {
		const lineHue = (hue + 30 + p * 17) % 360;
		ctx.strokeStyle = `hsla(${lineHue}, 62%, 58%, ${0.22 + rng() * 0.18})`;
		ctx.lineWidth = 0.6 + rng() * 0.5;

		let x = rng() * width;
		let y = rng() * height;
		ctx.beginPath();
		ctx.moveTo(x, y);

		for (let step = 0; step < 50; step++) {
			const angle =
				Math.sin(x * freq + phase + seed * 0.001) * Math.cos(y * freq + phase * 0.6) * Math.PI * 2 +
				rng() * 0.15;
			x += Math.cos(angle) * 2.2;
			y += Math.sin(angle) * 2.2;
			if (x < -4 || x > width + 4 || y < -4 || y > height + 4) break;
			ctx.lineTo(x, y);
		}

		ctx.stroke();
	}

	return { type: "canvas", element: canvas };
}

function auroraAccent(seed) {
	const rng = mulberry32(seed);
	const palette = auroraPalette(seed, rng);
	const c = palette[0];
	return `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
}

function identiconAccent(seed) {
	return `hsl(${seed % 360}, 58%, 48%)`;
}

function flowAccent(seed) {
	return `hsl(${seed % 360}, 62%, 58%)`;
}

const accentColors = {
	aurora: auroraAccent,
	identicon: identiconAccent,
	flow: flowAccent,
};

const renderers = {
	aurora: renderAurora,
	identicon: renderIdenticon,
	flow: renderFlow,
};

export const SessionArt = {
	styles: ["aurora", "identicon", "flow"],
	labels: {
		aurora: "Aurora",
		identicon: "Identicon",
		flow: "Flow field",
	},
	render(style, seed, width = 148, height = 68) {
		const fn = renderers[style] || renderers.aurora;
		return fn(seed, width, height);
	},
	accentColor(style, seed) {
		const fn = accentColors[style] || accentColors.aurora;
		return fn(seed);
	},
};
