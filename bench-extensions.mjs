/**
 * Per-extension load time benchmark using pi's extension loader directly.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const agentDir = join(homedir(), ".pi", "agent");
const cwd = process.env.PI_CWD || process.cwd();
const settings = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf8"));

// Dynamic import from globally installed pi-coding-agent
const piRoot = "C:/Users/rapga/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist";
const { loadExtensions } = await import(`file:///${piRoot.replace(/\\/g, "/")}/core/extensions/loader.js`);
const { DefaultPackageManager } = await import(`file:///${piRoot.replace(/\\/g, "/")}/core/package-manager.js`);
const { SettingsManager } = await import(`file:///${piRoot.replace(/\\/g, "/")}/core/settings-manager.js`);

async function resolveExtensionPaths() {
	const sm = SettingsManager.create(cwd, agentDir);
	const pm = new DefaultPackageManager({ cwd, agentDir, settingsManager: sm });
	const resolved = await pm.resolve();
	return resolved.extensions
		.filter((r) => r.enabled)
		.map((r) => ({
			path: r.path,
			source: r.metadata?.origin ?? "?",
			label: r.metadata?.packageSource ?? r.path.replace(/\\/g, "/").split("/").slice(-3).join("/"),
		}));
}

async function timeExtension(path) {
	const t0 = performance.now();
	const result = await loadExtensions([path], cwd);
	const ms = performance.now() - t0;
	const name = result.extensions[0]?.name ?? path.split(/[\\/]/).pop();
	const err = result.errors[0]?.error;
	return { path, name, ms, err };
}

console.log(`Per-extension load times (cwd: ${cwd})\n`);

const paths = await resolveExtensionPaths();
console.log(`Found ${paths.length} enabled extension entry points\n`);

const rows = [];
for (const { path, source, label } of paths) {
	const r = await timeExtension(path);
	rows.push({ ...r, source, label });
	const status = r.err ? `ERROR: ${r.err}` : "ok";
	console.log(`${r.ms.toFixed(0).padStart(6)}ms  [${source}] ${label} — ${status}`);
}

rows.sort((a, b) => b.ms - a.ms);
console.log("\n--- Top slowest ---");
for (const r of rows.slice(0, 10)) {
	console.log(`  ${r.ms.toFixed(0)}ms  ${r.label}`);
}

// Skills size check
import { readdirSync, statSync } from "node:fs";
function skillStats(dir) {
	let count = 0;
	let bytes = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) {
			const sub = skillStats(p);
			count += sub.count;
			bytes += sub.bytes;
		} else if (entry.name === "SKILL.md") {
			count++;
			bytes += statSync(p).size;
		}
	}
	return { count, bytes };
}

const skillsDir = join(agentDir, "skills");
const skills = skillStats(skillsDir);
console.log(`\nSkills: ${skills.count} files, ${(skills.bytes / 1024).toFixed(1)} KB total prompt content`);
