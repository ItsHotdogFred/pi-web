/** @type {string | null} */
let resumeSessionId = null;

let reconnectAttempt = 0;

export function getResumeSessionId() {
	return resumeSessionId;
}

export function setResumeSessionId(id) {
	resumeSessionId = id;
}

export function clearResumeSessionId() {
	resumeSessionId = null;
}

export function getReconnectAttempt() {
	return reconnectAttempt;
}

export function incrementReconnectAttempt() {
	reconnectAttempt += 1;
}

export function resetReconnectAttempts() {
	reconnectAttempt = 0;
}
