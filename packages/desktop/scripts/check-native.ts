/**
 * Native module ABI compatibility check.
 *
 * Runs before `electron .` to catch ABI mismatches early and print
 * actionable instructions instead of letting Electron crash with a
 * cryptic error.
 *
 * @lore N4: Uses `nm` to read the compiled NODE_MODULE_VERSION from the
 * better-sqlite3 .node binary without loading it. Loading the binary would
 * require running under the exact Node ABI it was compiled for, creating a
 * chicken-and-egg problem. `nm` reads the exported symbol name which follows
 * the pattern `_node_register_module_v<ABI>` — present in every non-NAPI
 * native module. This works regardless of the current runtime ABI and avoids
 * the Bun vs Node ABI trilemma.
 *
 * @lore N4: better-sqlite3 is compiled once during `bun install` against
 * the system Node ABI. Electron embeds Node 22.19.0 (ABI 135). When the
 * two ABIs differ, the native addon throws "NODE_MODULE_VERSION" on load.
 * Running `bun run native:electron` recompiles the addon for ABI 135.
 * Running `bun run native:node` (bun install --force) reverts to the
 * system Node ABI for `bun dev` / standalone server use.
 *
 * @lore N4: The expected Electron ABI (135) is derived from Electron 36
 * which bundles Node 22.19.0. Update ELECTRON_ABI when upgrading Electron.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const NATIVE_ELECTRON_CMD = "bun run native:electron";
const NATIVE_NODE_CMD = "bun run native:node";

// Electron 36 bundles Node 22.19.0 which uses ABI 135.
// Update this when upgrading Electron.
const ELECTRON_ABI = 135;

function findBetterSqliteBinary(): string {
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const workspaceRoot = path.resolve(scriptDir, "../../..");

	// Try the .bun/ path (Bun's module layout)
	// Bun places packages at node_modules/.bun/<pkg>@<ver>/node_modules/<pkg>/
	const bunGlob = path.join(workspaceRoot, "node_modules", ".bun");
	if (fs.existsSync(bunGlob)) {
		const entries = fs.readdirSync(bunGlob);
		const bsEntry = entries.find((e) => e.startsWith("better-sqlite3@"));
		if (bsEntry) {
			const candidate = path.join(
				bunGlob,
				bsEntry,
				"node_modules",
				"better-sqlite3",
				"build",
				"Release",
				"better_sqlite3.node",
			);
			if (fs.existsSync(candidate)) return candidate;
		}
	}

	// Fallback: standard npm/yarn node_modules layout
	const stdPath = path.join(
		workspaceRoot,
		"node_modules",
		"better-sqlite3",
		"build",
		"Release",
		"better_sqlite3.node",
	);
	if (fs.existsSync(stdPath)) return stdPath;

	throw new Error("Could not find better_sqlite3.node binary. Run `bun install` first.");
}

function readCompiledAbi(binaryPath: string): number | null {
	try {
		// `nm` reads the symbol table from the Mach-O/ELF binary.
		// Every non-NAPI native module exports _node_register_module_v<ABI>.
		const nmOutput = execSync(`nm "${binaryPath}" 2>/dev/null`, {
			encoding: "utf8",
			timeout: 10000,
		});
		const match = /_node_register_module_v(\d+)/.exec(nmOutput);
		if (match?.[1]) return Number.parseInt(match[1], 10);
	} catch {
		// nm not available or binary is not readable — degrade gracefully.
	}
	return null;
}

async function checkNativeModule(): Promise<void> {
	let binaryPath: string;
	try {
		binaryPath = findBetterSqliteBinary();
	} catch (err) {
		process.stderr.write(`[check-native] ERROR: ${(err as Error).message}\n`);
		process.exit(1);
		return; // unreachable, satisfies TypeScript
	}

	const compiledAbi = readCompiledAbi(binaryPath);

	if (compiledAbi === null) {
		// Cannot determine ABI (nm not available on this platform) — warn but don't block.
		process.stdout.write(
			"[check-native] WARNING: cannot determine compiled ABI (nm not available). Proceeding.\n",
		);
		return;
	}

	if (compiledAbi === ELECTRON_ABI) {
		process.stdout.write(
			`[check-native] better-sqlite3 OK — compiled for Electron ABI ${compiledAbi} (matches Electron 36)\n`,
		);
	} else {
		process.stderr.write(
			`[check-native] ABI mismatch: better-sqlite3 compiled for ABI ${compiledAbi}, but Electron 36 requires ABI ${ELECTRON_ABI}.\n`,
		);
		process.stderr.write(`[check-native] Rebuild for Electron:\n  ${NATIVE_ELECTRON_CMD}\n`);
		process.stderr.write(
			`[check-native] After desktop dev, restore system Node with:\n  ${NATIVE_NODE_CMD}\n`,
		);
		process.exit(1);
	}
}

await checkNativeModule();
