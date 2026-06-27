/**
 * Benchmark pi RPC switch_session with/without extensions.
 */
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { getSessionFileIndex } from "./src/sessions/sessionFiles.js";
import { DEFAULT_CWD } from "./src/config.js";

const piCmd = process.platform === "win32" ? "pi.cmd" : "pi";

async function benchmarkSwitch(extraArgs, label) {
	const index = await getSessionFileIndex(DEFAULT_CWD);
	const paths = [...index.values()];
	if (paths.length < 2) throw new Error("need at least 2 session files");

	const [pathA, pathB] = paths;

	return new Promise((resolve, reject) => {
		const child = spawn(piCmd, ["--mode", "rpc", "--no-themes", ...extraArgs], {
			cwd: DEFAULT_CWD,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, PI_TIMING: "1" },
			shell: process.platform === "win32",
		});

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (c) => {
			stdout += c.toString();
		});
		child.stderr.on("data", (c) => {
			stderr += c.toString();
		});

		let nextId = 1;
		const send = (cmd) => {
			const id = String(nextId++);
			child.stdin.write(`${JSON.stringify({ ...cmd, id })}\n`);
			return id;
		};

		const responses = new Map();
		child.stdout.on("data", (chunk) => {
			for (const line of chunk.toString().split("\n")) {
				if (!line.trim()) continue;
				try {
					const msg = JSON.parse(line);
					if (msg.type === "response" && msg.id) responses.set(msg.id, msg);
				} catch {
					// prelude lines
				}
			}
		});

		child.on("error", reject);

		const startupDeadline = performance.now() + 8000;
		const waitStartup = () => {
			if (responses.size > 0 || performance.now() > startupDeadline) {
				const t0 = performance.now();
				const id = send({ type: "switch_session", sessionPath: pathB });
				const poll = () => {
					const res = responses.get(id);
					if (res) {
						child.kill();
						const timings = {};
						const block = stderr.match(/--- Startup Timings ---([\s\S]*?)------------------------/);
						if (block) {
							for (const line of block[1].split("\n")) {
								const m = line.match(/^\s+(.+?):\s+(\d+)ms/);
								if (m) timings[m[1]] = Number(m[2]);
							}
						}
						resolve({
							label,
							switchMs: Math.round(performance.now() - t0),
							success: res.success,
							createAgentSessionRuntime: timings.createAgentSessionRuntime ?? null,
						});
						return;
					}
					if (performance.now() - t0 > 30_000) {
						child.kill();
						reject(new Error(`${label}: timed out`));
						return;
					}
					setTimeout(poll, 25);
				};
				poll();
				return;
			}
			setTimeout(waitStartup, 100);
		};

		// Prime with first session path (startup may already load one)
		setTimeout(() => send({ type: "switch_session", sessionPath: pathA }), 500);
		setTimeout(waitStartup, 3000);
	});
}

console.log(`switch_session benchmark (cwd: ${DEFAULT_CWD})\n`);

for (const scenario of [
	{ label: "full extensions", args: [] },
	{ label: "no extensions", args: ["--no-extensions"] },
]) {
	try {
		const r = await benchmarkSwitch(scenario.args, scenario.label);
		console.log(
			`${r.label}: switch=${r.switchMs}ms, createAgentSessionRuntime=${r.createAgentSessionRuntime ?? "?"}ms, ok=${r.success}`,
		);
	} catch (err) {
		console.log(`${scenario.label}: FAILED — ${err.message}`);
	}
}
