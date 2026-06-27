export const SKILLS_MARKER = "## Skills";
export const EXTENSIONS_MARKER = "## Extensions";

export function isStartupDump(text) {
	return typeof text === "string" && text.includes(SKILLS_MARKER) && text.includes(EXTENSIONS_MARKER);
}

export function couldBeStartupPartial(buffer) {
	if (buffer.includes(SKILLS_MARKER) && !buffer.includes(EXTENSIONS_MARKER)) return true;
	for (const marker of [SKILLS_MARKER, EXTENSIONS_MARKER]) {
		for (let i = 1; i < marker.length; i++) {
			if (buffer.endsWith(marker.slice(0, i))) return true;
		}
	}
	return false;
}
