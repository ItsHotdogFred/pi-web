import { spawn } from "node:child_process";

import { PI_ACP_ARGS, PI_ACP_COMMAND, PI_ACP_SHELL } from "../config.js";

export function spawnPiAcp(cwd) {
	const child = spawn(PI_ACP_COMMAND, PI_ACP_ARGS, {
		cwd,
		stdio: ["pipe", "pipe", "pipe"],
		env: {
			...process.env,
			PI_ACP_ENABLE_EXTENSION_COMMANDS: process.env.PI_ACP_ENABLE_EXTENSION_COMMANDS ?? "1",
		},
		shell: PI_ACP_SHELL,
	});

	child.stderr?.on("data", (chunk) => {
		process.stderr.write(`[pi-acp] ${chunk}`);
	});

	child.on("error", (error) => {
		console.error("[pi-acp] failed to start:", error.message);
	});

	return child;
}
