import { DEFAULT_CWD, HOST, PI_ACP_ARGS, PI_ACP_COMMAND, PORT } from "./src/config.js";
import { createAppServer } from "./src/server/createServer.js";

const { server } = createAppServer();

server.on("error", (err) => {
	if (err.code === "EADDRINUSE") {
		console.error(`Port ${PORT} is already in use (another pi-web instance may be running).`);
		console.error(`Stop it or use a different port: PORT=3848 npm start`);
	} else {
		console.error(err);
	}
	process.exit(1);
});

server.listen(PORT, HOST, () => {
	console.log(`pi-web listening on http://${HOST}:${PORT}`);
	console.log(`default project cwd: ${DEFAULT_CWD}`);
	console.log(`pi-acp: ${PI_ACP_COMMAND} ${PI_ACP_ARGS.join(" ")}`);
});
