export function basename(path) {
	if (!path) return "pi-web";
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
	return parts[parts.length - 1] || path;
}

export function hashCode(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

export function formatRelativeTime(iso) {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const diff = Date.now() - then;
	const sec = Math.floor(diff / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d ago`;
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function sessionDateKey(iso) {
	if (!iso) return "";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function formatDateGroupLabel(iso) {
	if (!iso) return "Unknown";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "Unknown";

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const then = new Date(date);
	then.setHours(0, 0, 0, 0);
	const diffDays = Math.round((today - then) / (24 * 60 * 60 * 1000));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) {
		return date.toLocaleDateString(undefined, { weekday: "long" });
	}
	const opts = { month: "short", day: "numeric" };
	if (date.getFullYear() !== today.getFullYear()) opts.year = "numeric";
	return date.toLocaleDateString(undefined, opts);
}

export function escapeHtml(text) {
	return String(text)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

export function formatRaw(value) {
	if (value == null || value === "") return "";
	if (typeof value === "string") {
		try {
			return JSON.stringify(JSON.parse(value), null, 2);
		} catch {
			return value;
		}
	}
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

export function formatTokenCount(value) {
	if (value == null || Number.isNaN(value)) return "—";
	const n = Math.max(0, Math.round(value));
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (n >= 10_000) return `${Math.round(n / 1000)}k`;
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return String(n);
}

export function formatBreakdownTokenCount(value) {
	if (value == null || Number.isNaN(value)) return "—";
	return Math.max(0, Math.round(value)).toLocaleString();
}

export function truncateText(text, max = 220) {
	if (!text) return "";
	const trimmed = text.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max)}…`;
}

export function normalizeStatus(status) {
	return String(status ?? "running").toLowerCase().replace(/\s+/g, "_");
}

export function statusLabel(status) {
	return normalizeStatus(status).replace(/_/g, " ");
}

export { parseRawObject, parseToolPayload, extractFilePath } from "./payload.js";
export {
	buildEditDiffFromInput,
	buildWriteDiff,
	isDiffToolName,
	renderDiffView,
	looksLikeUnifiedDiff,
	buildSyntheticDiff,
} from "./diff.js";
