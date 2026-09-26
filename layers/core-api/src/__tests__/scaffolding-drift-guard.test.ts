/**
 * Scaffolding drift-guard: SANDBOX_SCAFFOLDING_PATHS must cover EVERY path
 * emitted by EVERY real writer that drops files into the per-session working
 * directory. When a writer adds a path the constant doesn't cover, this goes
 * red immediately — the constant can never silently fall behind and corrupt
 * a capture by committing scaffolding as authored output.
 *
 * Imports the real writer surfaces (EMITTED_ROOTS_* consts, the real harness
 * provisioners) from each module and calls them — not a filesystem grep.
 * This composition root legitimately spans context-assembly, session
 * lifecycle, filesystems and harness-registry to wire and check them all.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { provisionHarnessEnvironment } from "@hyperidle/harness-registry";
import { SANDBOX_SCAFFOLDING_PATHS } from "@hyperidle/run-orchestration";
import {
	createContextAssembler,
	createProvisioner,
} from "@hyperidle/run-orchestration/scaffolding";
import { describe, expect, it } from "vitest";

// ── Coverage helper ───────────────────────────────────────────────────────────

/**
 * A path is "covered" if it equals an entry in SANDBOX_SCAFFOLDING_PATHS OR
 * starts with a directory-root entry followed by '/'.
 *
 * e.g. "context/session.toon" is covered by root "context"
 *      ".fabric/manifest.json" is covered by root ".fabric"
 *      "CLAUDE.md" is covered by exact-match "CLAUDE.md"
 */
function isCovered(emittedPath: string, scaffoldingPaths: readonly string[]): boolean {
	for (const sp of scaffoldingPaths) {
		if (emittedPath === sp) return true;
		if (emittedPath.startsWith(`${sp}/`)) return true;
	}
	return false;
}

function assertAllCovered(writerName: string, emittedRoots: readonly string[]): void {
	for (const root of emittedRoots) {
		const covered = isCovered(root, SANDBOX_SCAFFOLDING_PATHS);
		if (!covered) {
			throw new Error(
				`DRIFT: ${writerName} emits '${root}' which is NOT covered by SANDBOX_SCAFFOLDING_PATHS.\n` +
					`Add '${root}' (or its parent root) to layers/core-api/filesystems/src/scaffolding-paths.ts`,
			);
		}
	}
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SANDBOX_SCAFFOLDING_PATHS drift-guard", () => {
	const context = createContextAssembler({} as Parameters<typeof createContextAssembler>[0]);
	const provisioner = createProvisioner({} as Parameters<typeof createProvisioner>[0]);

	it("covers context assembly's public filesystem contract", () => {
		assertAllCovered("runSession assemble", context.emittedContextRoots);
	});

	it("covers the public session instruction files", () => {
		assertAllCovered("runSession session instructions", context.emittedAgentRoots);
	});

	it("covers the public MCP configuration file", () => {
		assertAllCovered("runSession MCP configuration", provisioner.emittedFiles);
	});

	it("covers skill dirs written by writeSkillItem", () => {
		assertAllCovered("writeSkillItem (skill dirs)", context.emittedSkillRoots);
	});

	it("covers every harness environment artifact emitted by the product writer", async () => {
		for (const channel of ["settings-claude", "settings-codex", "process-reengage"] as const) {
			const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "harness-scaffold-"));
			await provisionHarnessEnvironment({
				sandboxPath,
				channel,
				mcpUrl: "http://127.0.0.1/api/mcp/token",
				token: "token",
			});
			assertAllCovered(channel, fs.readdirSync(sandboxPath));
			fs.rmSync(sandboxPath, { recursive: true, force: true });
		}
		const sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "harness-scaffold-"));
		await provisionHarnessEnvironment({
			sandboxPath,
			dialect: "opencode-json",
			mcpUrl: "http://127.0.0.1/api/mcp/token",
			token: "token",
		});
		assertAllCovered("opencode-json", fs.readdirSync(sandboxPath));
		fs.rmSync(sandboxPath, { recursive: true, force: true });
	});

	it("SANDBOX_SCAFFOLDING_PATHS has no duplicate entries", () => {
		const seen = new Set<string>();
		for (const p of SANDBOX_SCAFFOLDING_PATHS) {
			expect(seen.has(p), `duplicate entry in SANDBOX_SCAFFOLDING_PATHS: '${p}'`).toBe(false);
			seen.add(p);
		}
	});

	it("SANDBOX_SCAFFOLDING_PATHS is non-empty", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS.length).toBeGreaterThan(0);
	});
});
