export const MAX_WIRE_CHARS = 2000;

export function sendJson(ws, payload) {
	if (ws.readyState === ws.OPEN) {
		ws.send(JSON.stringify(payload));
	}
}

export function truncateWire(value, max = MAX_WIRE_CHARS) {
	if (value == null) return value;
	if (typeof value === "string") {
		return value.length > max ? `${value.slice(0, max)}…` : value;
	}
	if (typeof value === "object") {
		try {
			const text = JSON.stringify(value);
			if (text.length <= max) return value;
			return { truncated: true, preview: `${text.slice(0, max)}…` };
		} catch {
			return value;
		}
	}
	return value;
}

export function sendContextUsage(ws, usage) {
	if (!usage) return;
	sendJson(ws, {
		type: "context",
		used: usage.used,
		size: usage.size,
		percent: usage.percent,
		breakdown: Array.isArray(usage.breakdown) ? usage.breakdown : [],
	});
}
