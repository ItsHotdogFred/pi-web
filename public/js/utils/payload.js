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
