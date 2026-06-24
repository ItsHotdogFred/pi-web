/**
 * Profile pi RPC startup. Uses PI_TIMING=1 (printed to stderr before RPC loop).
 */
import { spawn } from "node:child_process";

const cwd = process.env.PI_CWD || process.cwd();
const piCmd = process.platform === "win32" ? "pi.cmd" : "pi";

function measureStartup(extraArgs = [], label = "default") {
	return new Promise((resolve, reject) => {
		const start = performance.now();
		const child = spawn(piCmd, ["--mode", "rpc", "--no-themes", ...extraArgs], {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, PI_TIMING: "1" },
			shell: process.platform === "win32",
		});

		let stderr = "";
		child.stderr?.on("data", (c) => {
			stderr += c.toString();
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`${label}: timed out after 60s`));
		}, 60_000);

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});

		child.on("exit", () => {
			clearTimeout(timer);
			const wall = performance.now() - start;
			const timingsMatch = stderr.match(
				/--- Startup Timings ---([\s\S]*?)------------------------/,
			);
			const rows = {};
			if (timingsMatch) {
				for (const line of timingsMatch[1].split("\n")) {
					const m = line.match(/^\s+(.+?):\s+(\d+)ms/);
					if (m) rows[m[1]] = Number(m[2]);
				}
			}
			resolve({ label, wall, rows, stderr });
		});

		// RPC mode waits for stdin; close stdin after process prints timings and blocks
		setTimeout(() => child.stdin.end(), 500);
	});
}

const scenarios = [
	{ label: "full (all packages)", args: [] },
	{ label: "no extensions", args: ["--no-extensions"] },
	{ label: "no skills", args: ["--no-skills"] },
	{ label: "no extensions + no skills", args: ["--no-extensions", "--no-skills"] },
];

console.log(`Pi startup profile (cwd: ${cwd})\n`);

const results = [];
for (const s of scenarios) {
	try {
		const r = await measureStartup(s.args, s.label);
		results.push(r);
		console.log(`${s.label}: wall=${r.wall.toFixed(0)}ms, createAgentSessionRuntime=${r.rows.createAgentSessionRuntime ?? "?"}ms`);
	} catch (err) {
		console.log(`${s.label}: FAILED — ${err.message}`);
	}
}

console.log("\n--- Breakdown (full load) ---");
const full = results.find((r) => r.label.startsWith("full"));
if (full?.timingsMatch || full?.rows) {
	for (const [k, v] of Object.entries(full.rows)) {
		console.log(`  ${k}: ${v}ms`);
	}
}
