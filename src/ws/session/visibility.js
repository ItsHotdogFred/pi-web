export function visibleSessions(session, sessions) {
	const activeId = session.session?.sessionId;
	return (sessions ?? []).filter((entry) => {
		if (!entry?.sessionId) return false;
		if (entry.sessionId === activeId) return true;
		return !session.hiddenSessionIds.has(entry.sessionId);
	});
}
