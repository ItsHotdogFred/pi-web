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
	if (min < 60) return `${min}m`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h`;
	const day = Math.floor(hr / 24);
	if (day < 7) return `${day}d`;
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

export function parseRawObject(value) {
	if (value == null || value === "") return null;
	if (typeof value === "object") {
		if (value.truncated) return null;
		return value;
	}
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return null;
}

export function looksLikeUnifiedDiff(text) {
	if (!text || typeof text !== "string") return false;
	const trimmed = text.trim();
	return /^(\-\-\-|\+\+\+|@@)/m.test(trimmed);
}

export function extractFilePath(payload) {
	if (!payload || typeof payload !== "object") return null;
	return payload.path || payload.file_path || payload.filePath || payload.file || payload.target || null;
}

export function parseToolPayload(raw) {
	if (raw == null) return null;
	if (typeof raw === "object") {
		if (raw.truncated && typeof raw.preview === "string") {
			try {
				return JSON.parse(raw.preview);
			} catch {
				return null;
			}
		}
		return raw;
	}
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export function buildSyntheticDiff(input) {
	const path = extractFilePath(input) ?? "file";
	const oldText = String(input.old_string ?? "");
	const newText = String(input.new_string ?? input.content ?? "");
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	const lines = [`--- a/${path}`, `+++ b/${path}`];
	const max = Math.max(oldLines.length, newLines.length);
	for (let i = 0; i < max; i++) {
		const oldLine = oldLines[i];
		const newLine = newLines[i];
		if (oldLine === newLine) {
			if (oldLine !== undefined) lines.push(` ${oldLine}`);
		} else {
			if (oldLine !== undefined) lines.push(`-${oldLine}`);
			if (newLine !== undefined) lines.push(`+${newLine}`);
		}
	}
	return lines.join("\n");
}

export function buildWriteDiff(input) {
	const path = extractFilePath(input) ?? "file";
	const content = String(input.content ?? "");
	if (!content.trim()) return null;
	const contentLines = content.split("\n");
	const lines = [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${contentLines.length} @@`];
	for (const line of contentLines) {
		lines.push(`+${line}`);
	}
	return lines.join("\n");
}

export function buildEditDiffFromInput(input) {
	const path = extractFilePath(input) ?? "file";

	if (Array.isArray(input.edits) && input.edits.length) {
		const lines = [`--- a/${path}`, `+++ b/${path}`];
		for (const edit of input.edits) {
			const oldText = String(edit.oldText ?? edit.old_string ?? "");
			const newText = String(edit.newText ?? edit.new_string ?? "");
			if (oldText) {
				for (const line of oldText.split("\n")) lines.push(`-${line}`);
			}
			if (newText) {
				for (const line of newText.split("\n")) lines.push(`+${line}`);
			}
		}
		return lines.length > 2 ? lines.join("\n") : null;
	}

	const oldText = input.oldText ?? input.old_string;
	const newText = input.newText ?? input.new_string;
	if (oldText != null || newText != null) {
		return buildSyntheticDiff({
			path,
			old_string: oldText ?? "",
			new_string: newText ?? "",
		});
	}

	return null;
}

export function isDiffToolName(name) {
	return /^(edit|write|patch|replace|create)$/.test(String(name ?? "").toLowerCase());
}

export function renderDiffView(diffText) {
	const lines = String(diffText).split("\n");
	let html = '<div class="diff-view" tabindex="0">';
	for (const line of lines) {
		let cls = "diff-line";
		if (line.startsWith("---") || line.startsWith("+++")) cls += " diff-line-meta";
		else if (line.startsWith("@@")) cls += " diff-line-hunk";
		else if (line.startsWith("+")) cls += " diff-line-add";
		else if (line.startsWith("-")) cls += " diff-line-del";
		else cls += " diff-line-ctx";

		const gutter = line.length ? line[0] : " ";
		const body = line.length > 1 ? line.slice(1) : line === "+" || line === "-" ? "" : line;
		html += `<div class="${cls}"><span class="diff-gutter">${escapeHtml(gutter)}</span><code>${escapeHtml(body)}</code></div>`;
	}
	html += "</div>";
	return html;
}
