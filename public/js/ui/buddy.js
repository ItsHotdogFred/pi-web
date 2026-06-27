import { COMPOSER_SCOPES } from "../config.js";

const PALETTE = {
	".": null,
	B: "#4f46e5",
	D: "#312e81",
	L: "#818cf8",
	C: "#22d3ee",
	W: "#f8fafc",
	P: "#0f172a",
};

const SPRITE = [
	"....................",
	"......CC....CC......",
	".....CCCC..CCCC.....",
	"....BBBBBBBBBBBB....",
	"...BBBBBBBBBBBBBB...",
	"...BBWWWWBBWWWWBB...",
	"...BBWPPWBBWPPWBB...",
	"...BBBBBBBBBBBBBB...",
	"....BBBBBBBBBBBB....",
	".....BB....BB.......",
	".....BB....BB.......",
	"....DDD....DDD......",
];

const SPRITE_BLINK = [
	"....................",
	"......CC....CC......",
	".....CCCC..CCCC.....",
	"....BBBBBBBBBBBB....",
	"...BBBBBBBBBBBBBB...",
	"...BBLLLLBBLLLLBB...",
	"...BBWPPWBBWPPWBB...",
	"...BBBBBBBBBBBBBB...",
	"....BBBBBBBBBBBB....",
	".....BB....BB.......",
	".....BB....BB.......",
	"....DDD....DDD......",
];

const BUDDY_LINES = [
	"Ship small, break nothing.",
	"Read the error message.",
	"Git blame yourself first.",
	"One bug at a time.",
	"Coffee then code maybe.",
	"It works on my machine.",
	"Sleep is a feature too.",
	"Rubber duck knows all.",
	"Paste is not a pattern.",
	"Fewer deps, fewer regrets.",
	"Commit before you refactor.",
	"Logs beat guessing every time.",
	"Name things like you mean it.",
	"Tests save future you.",
	"Undo is your best friend.",
	"Ask the docs, not me.",
	"Scope creep is still creep.",
	"YAGNI until you don't.",
	"Refresh the page. Seriously.",
	"Check the env vars first.",
	"Null checks never go out.",
	"Write it down, forget less.",
	"Slow is smooth, smooth fast.",
	"Delete code, gain clarity.",
	"Two spaces or riot.",
	"Tabs versus spaces: peace.",
	"Merge conflicts build character.",
	"Stack Overflow remembers all.",
	"Rub some console.log on it.",
	"Feature flags save weekends.",
	"Read diffs before you merge.",
	"Lint now, cry less later.",
	"Cache invalidation is hard.",
	"Naming is the hard part.",
	"Make it work, then pretty.",
	"Edge cases live everywhere.",
	"Prod is a mood, not place.",
	"Reboot fixes half of IT.",
	"Trust but verify inputs.",
	"Ship the fix, not guilt.",
	"Your future self thanks you.",
	"Keyboard shortcuts win time.",
	"Silence is a valid response.",
	"Pi digits go on forever.",
	"Hello from the corner.",
	"Click again, I'm shy.",
	"Still here. Still pixels.",
	"404: wisdom not found.",
];

const RARE_LINES = [
	"You found the rare crab.",
	"Golden wisdom. Cherish it.",
	"One in a hundred. Lucky.",
	"Shiny advice unlocked.",
	"The pixels align today.",
	"Legendary tip acquired.",
	"Achievement: clicked buddy.",
];

const MORNING_LINES = ["Good morning, builder.", "Early bird gets bugs.", "Coffee first, code second."];
const AFTERNOON_LINES = ["Good afternoon.", "Peak hours. Ship something.", "Sun's up, bugs down."];
const EVENING_LINES = ["Good evening.", "Twilight commit hour.", "Almost dinner time."];
const NIGHT_LINES = ["Go to bed soon.", "Night owl mode on.", "Stars out, bugs in."];
const FRIDAY_LINES = ["Friday deploy? Brave.", "Weekend is loading.", "TGIF, ship carefully."];

const COMPOSER_FOCUS_LINES = ["I'm listening.", "Take your time.", "Say it your way."];
const COMPOSER_LONG_LINES = ["That's a novel.", "War and peace vibes.", "Shorten that maybe."];
const COMPOSER_EMPTY_LINES = ["Come back soon.", "I'll wait here.", "Empty box, full potential."];

const KONAMI_SEQUENCE = [
	"ArrowUp",
	"ArrowUp",
	"ArrowDown",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowLeft",
	"ArrowRight",
	"KeyB",
	"KeyA",
];

const SPRITE_W = 60;
const SPRITE_H = 36;
const FLOOD_BATCH = 48;
const LONG_TYPE_CHARS = 500;
const RARE_CHANCE = 0.01;
const TIME_GREETING_CHANCE = 0.28;

let speechTimer = null;
let blinkTimer = null;
let konamiIndex = 0;
let floodActive = false;

function wordCount(text) {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

function pickFrom(pool) {
	const valid = pool.filter((line) => wordCount(line) <= 8);
	const lines = valid.length > 0 ? valid : pool;
	return lines[Math.floor(Math.random() * lines.length)];
}

function pickTimeGreeting() {
	const hour = new Date().getHours();
	const day = new Date().getDay();
	if (day === 5 && hour >= 15) return pickFrom(FRIDAY_LINES);
	if (hour >= 5 && hour < 12) return pickFrom(MORNING_LINES);
	if (hour >= 12 && hour < 17) return pickFrom(AFTERNOON_LINES);
	if (hour >= 17 && hour < 22) return pickFrom(EVENING_LINES);
	return pickFrom(NIGHT_LINES);
}

function pickLine() {
	if (Math.random() < RARE_CHANCE) return { text: pickFrom(RARE_LINES), rare: true };
	if (Math.random() < TIME_GREETING_CHANCE) return { text: pickTimeGreeting(), rare: false };
	return { text: pickFrom(BUDDY_LINES), rare: false };
}

function drawSprite(canvas, sprite = SPRITE) {
	const rows = sprite.length;
	const cols = sprite[0].length;
	const scale = 3;
	const ctx = canvas.getContext("2d");
	canvas.width = cols * scale;
	canvas.height = rows * scale;
	ctx.imageSmoothingEnabled = false;

	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const color = PALETTE[sprite[y][x]];
			if (!color) continue;
			ctx.fillStyle = color;
			ctx.fillRect(x * scale, y * scale, scale, scale);
		}
	}
}

function showSpeech(speechEl, text, { rare = false } = {}) {
	if (!speechEl) return;
	clearTimeout(speechTimer);
	speechEl.textContent = text;
	speechEl.classList.toggle("pi-buddy-speech--rare", rare);
	speechEl.classList.remove("hidden", "pi-buddy-speech--out");
	speechEl.classList.add("pi-buddy-speech--in");
	speechTimer = setTimeout(() => {
		speechEl.classList.remove("pi-buddy-speech--in");
		speechEl.classList.add("pi-buddy-speech--out");
		speechTimer = setTimeout(() => {
			speechEl.classList.add("hidden");
			speechEl.classList.remove("pi-buddy-speech--out", "pi-buddy-speech--rare");
		}, 220);
	}, 3200);
}

function scheduleBlink(canvas) {
	const delay = 8000 + Math.random() * 12000;
	blinkTimer = setTimeout(() => {
		drawSprite(canvas, SPRITE_BLINK);
		setTimeout(() => {
			drawSprite(canvas, SPRITE);
			scheduleBlink(canvas);
		}, 140);
	}, delay);
}

function initComposerAwareness(root, speech) {
	const input = document.getElementById(COMPOSER_SCOPES.dashboard.inputId);
	if (!input) return;

	let focusLineShown = false;
	let longLineShown = false;

	input.addEventListener("focus", () => {
		root.classList.add("pi-buddy--peeking");
		if (!focusLineShown) {
			focusLineShown = true;
			showSpeech(speech, pickFrom(COMPOSER_FOCUS_LINES));
		}
	});

	input.addEventListener("blur", () => {
		root.classList.remove("pi-buddy--peeking");
		focusLineShown = false;
		if (!input.value.trim()) showSpeech(speech, pickFrom(COMPOSER_EMPTY_LINES));
	});

	input.addEventListener("input", () => {
		if (!input.value.trim()) longLineShown = false;
		if (!longLineShown && input.value.length >= LONG_TYPE_CHARS) {
			longLineShown = true;
			showSpeech(speech, pickFrom(COMPOSER_LONG_LINES));
		}
	});
}

function initKonamiCode() {
	document.addEventListener("keydown", (event) => {
		if (event.repeat || floodActive) return;

		if (event.code === KONAMI_SEQUENCE[konamiIndex]) {
			konamiIndex += 1;
			if (konamiIndex >= KONAMI_SEQUENCE.length) {
				konamiIndex = 0;
				triggerBuddyFlood();
			}
			return;
		}

		konamiIndex = event.code === KONAMI_SEQUENCE[0] ? 1 : 0;
	});
}

function triggerBuddyFlood() {
	if (floodActive) return;
	floodActive = true;

	const overlay = document.createElement("div");
	overlay.className = "pi-buddy-flood";
	overlay.setAttribute("aria-hidden", "true");
	document.body.appendChild(overlay);

	const maxX = Math.max(0, window.innerWidth - SPRITE_W);
	const maxY = Math.max(0, window.innerHeight - SPRITE_H);
	const gridCover = Math.ceil(window.innerWidth / SPRITE_W) * Math.ceil(window.innerHeight / SPRITE_H);
	const total = Math.ceil(gridCover * 1.25);
	const sprites = [];
	let placed = 0;

	const placeBatch = () => {
		for (let n = 0; n < FLOOD_BATCH && placed < total; n++, placed++) {
			const canvas = document.createElement("canvas");
			canvas.width = SPRITE_W;
			canvas.height = SPRITE_H;
			canvas.className = "pi-buddy-flood__sprite";
			canvas.style.left = `${Math.random() * maxX}px`;
			canvas.style.top = `${Math.random() * maxY}px`;
			canvas.style.animationDelay = `${Math.random() * 0.08}s`;
			drawSprite(canvas);
			overlay.appendChild(canvas);
			sprites.push(canvas);
		}

		if (placed < total) {
			requestAnimationFrame(placeBatch);
			return;
		}

		setTimeout(() => dismissFloodSprites(overlay, sprites), 1000);
	};

	requestAnimationFrame(placeBatch);
}

function dismissFloodSprites(overlay, sprites) {
	const order = [...sprites].sort(() => Math.random() - 0.5);
	let i = 0;

	const dismissBatch = () => {
		for (let n = 0; n < FLOOD_BATCH && i < order.length; n++, i++) {
			order[i].classList.add("pi-buddy-flood__sprite--out");
		}

		if (i < order.length) {
			requestAnimationFrame(dismissBatch);
			return;
		}

		setTimeout(() => {
			overlay.remove();
			floodActive = false;
		}, 100);
	};

	requestAnimationFrame(dismissBatch);
}

export function initBuddy() {
	const root = document.getElementById("pi-buddy");
	const btn = document.getElementById("pi-buddy-btn");
	const canvas = document.getElementById("pi-buddy-canvas");
	const speech = document.getElementById("pi-buddy-speech");
	if (!root || !btn || !canvas) return;

	drawSprite(canvas);
	scheduleBlink(canvas);
	initComposerAwareness(root, speech);
	initKonamiCode();

	btn.addEventListener("click", () => {
		root.classList.remove("pi-buddy--hop");
		void root.offsetWidth;
		root.classList.add("pi-buddy--hop");
		const line = pickLine();
		showSpeech(speech, line.text, { rare: line.rare });
	});

	btn.addEventListener("animationend", (event) => {
		if (event.animationName === "pi-buddy-hop") root.classList.remove("pi-buddy--hop");
	});
}
