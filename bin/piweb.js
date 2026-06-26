#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(APP_ROOT, "server.js");

const pkg = JSON.parse(readFileSync(join(APP_ROOT, "package.json"), "utf8"));

const HELP = `pi-web v${pkg.version} — Pi in the browser

Usage:
  piweb [options]

Starts the pi-web server for the current directory as the default project.

Options:
  -h, --help       Show this help
  -v, --version    Print version
  -p, --port       HTTP/WebSocket port (default: 3847, or PORT)
      --host       Bind address (default: 127.0.0.1, or HOST)
      --cwd        Default project folder (default: current directory, or PI_CWD)

Composer tips:
  @path            Reference a file or folder (@ opens a picker)
  /command         Slash commands and extensions
  Attach           Drop or paste images in the composer

Examples:
  piweb
  piweb --port 3848
  piweb --cwd C:\\\\projects\\\\my-app

Environment: PORT, HOST, PI_CWD, PI_WEB_AUTO_APPROVE, PI_ACP_COMMAND, PI_ACP_ARGS
Docs: ${pkg.homepage ?? "https://github.com/ItsHotdogFred/pi-web"}
`;

function parseArgs(argv) {
	const opts = { help: false, version: false };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "-h":
			case "--help":
				opts.help = true;
				break;
			case "-v":
			case "--version":
				opts.version = true;
				break;
			case "-p":
			case "--port":
				opts.port = argv[++i];
				if (opts.port == null) throw new Error("Missing value for --port");
				break;
			case "--host":
				opts.host = argv[++i];
				if (opts.host == null) throw new Error("Missing value for --host");
				break;
			case "--cwd":
				opts.cwd = argv[++i];
				if (opts.cwd == null) throw new Error("Missing value for --cwd");
				break;
			default:
				throw new Error(`Unknown option: ${arg}\nRun piweb --help for usage.`);
		}
	}

	return opts;
}

let opts;
try {
	opts = parseArgs(process.argv.slice(2));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}

if (opts.help) {
	console.log(HELP);
	process.exit(0);
}

if (opts.version) {
	console.log(pkg.version);
	process.exit(0);
}

const projectCwd = opts.cwd ?? process.env.PI_CWD ?? process.cwd();
const env = { ...process.env };

if (opts.port != null) env.PORT = String(opts.port);
if (opts.host != null) env.HOST = opts.host;
if (opts.cwd != null) env.PI_CWD = opts.cwd;

const port = env.PORT || "3847";
const host = env.HOST || "127.0.0.1";

const child = spawn(process.execPath, [serverPath], {
	cwd: projectCwd,
	env,
	stdio: "inherit",
});

child.on("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
	} else {
		process.exit(code ?? 0);
	}
});

console.log(`Open http://${host}:${port}  ·  @ to reference files  ·  Ctrl+C to stop`);
