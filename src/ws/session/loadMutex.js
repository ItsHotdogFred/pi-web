export async function withSessionLoad(session, fn) {
	const run = session.sessionLoadMutex.then(fn, fn);
	session.sessionLoadMutex = run.then(
		() => {},
		() => {},
	);
	return run;
}
