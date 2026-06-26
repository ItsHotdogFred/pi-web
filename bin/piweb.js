#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(APP_ROOT, "server.js");
const projectCwd = process.cwd();

const child = spawn(process.execPath, [serverPath], {
	cwd: projectCwd,
	env: process.env,
	stdio: "inherit",
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
	} else {
		process.exit(code ?? 0);
	}
});
