import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

const PI_CWD = process.cwd();
const PI_ACP_COMMAND = "npx";
const PI_ACP_ARGS = ["-y", "pi-acp"];
const PI_ACP_SHELL = process.platform === "win32";

console.log("spawn:", PI_ACP_COMMAND, PI_ACP_ARGS.join(" "));

const child = spawn(PI_ACP_COMMAND, PI_ACP_ARGS, {
	cwd: PI_CWD,
	stdio: ["pipe", "pipe", "pipe"],
	env: process.env,
	shell: PI_ACP_SHELL,
});

child.on("error", (e) => console.error("spawn error:", e));
child.stderr?.on("data", (c) => console.error("[stderr]", c.toString()));
child.stdout?.on("data", (c) => console.log("[stdout]", c.toString().slice(0, 300)));

const input = Writable.toWeb(child.stdin);
const output = Readable.toWeb(child.stdout);
const stream = acp.ndJsonStream(input, output);

const app = acp
	.client({ name: "pi-web-debug" })
	.onRequest(acp.methods.client.session.requestPermission, (ctx) => {
		const preferred =
			ctx.params.options.find((o) => o.kind === "allow_once") ??
			ctx.params.options.find((o) => o.kind === "allow") ??
			ctx.params.options[0];
		return { outcome: { outcome: "selected", optionId: preferred.optionId } };
	});

const connection = app.connect(stream);
const ctx = connection.agent;

try {
	const init = await ctx.request(acp.methods.agent.initialize, {
		protocolVersion: acp.PROTOCOL_VERSION,
		clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
	});
	console.log("init ok:", init);

	const session = await ctx.buildSession(PI_CWD).start();
	console.log("session ok:", session.sessionId);

	session.dispose();
	connection.close();
	child.kill();
} catch (error) {
	console.error("FAILED:", error);
	child.kill();
	process.exit(1);
}
