/**
 * AO2 — Scaffolding drift-guard (C2).
 *
 * Asserts that SANDBOX_SCAFFOLDING_PATHS covers EVERY path emitted by EVERY real
 * writer that drops files into the per-session working directory.
 *
 * When a future writer adds a scaffolding path that SANDBOX_SCAFFOLDING_PATHS
 * doesn't cover, CI goes red immediately — the constant can never silently fall
 * behind and corrupt a capture by committing scaffolding as authored output.
 *
 * This is a static-property test on real code constants — NOT a filesystem grep.
 * It imports the real writer surfaces (EMITTED_ROOTS_* consts) from each module.
 *
 * @lore AO2 C2 round-2: ALL harness provisioners must be enumerated — not just
 * Claude. Codex (.codex, .codex-home) and OpenCode (.opencode) were the gap in
 * the original drift-guard spec.
 *
 * @lore AU19 Increment 2b: `SANDBOX_SCAFFOLDING_PATHS` (the constant under
 * test) moved to `@hyperidle/filesystems`, but this test itself STAYED under
 * `packages/server/src/filesystem/__tests__/` at the time — its other two
 * writer surfaces (`session-provisioning.ts`, `harness/*`) were still
 * `packages/server`-only, and a core-api Service package can never import
 * from another Service/Layer (Mechanism C). This cross-cutting guard could
 * only compose at the `packages/server` (then-unguarded composition root)
 * level until every writer it covers had migrated.
 *
 * @lore AU19 Increment 3 (context-assembly finalize): `EMITTED_ROOTS_CONTEXT_ASSEMBLY`/
 * `EMITTED_ROOTS_AGENTS_MD` now import from the real `@hyperidle/context-assembly`
 * package instead of the deleted flat `services/context-assembly*.ts` files.
 *
 * @lore AU19 Increment 5 (item 2): `packages/server` dissolved. This test
 * relocated a second time — from `layers/core-api/filesystems/src/
 * __tests__/` (its Increment-2b home, a NESTED core-api Service package) to
 * `layers/core-api/src/__tests__/` (the `core-api` Layer's own composition
 * root). It genuinely spans four Layers/Services (`context-assembly`,
 * `session-lifecycle` — agent-orchestration; `filesystems` — core-api;
 * `harness-registry` — agent-execution) and legitimately needs to import
 * `@hyperidle/harness-registry`'s pure-constant `EMITTED_ROOTS_*` exports —
 * exactly the "composition root legitimately wires the execution Service
 * packages" case `execution-boundary-guard.ts`'s check-3 exemption
 * (narrow raw-runtime-bypass ban, not the full Service-boundary ban) is for.
 * A NESTED core-api Service package (like `filesystems`, its prior home)
 * does NOT get that exemption — only the Layer's own `src/` composition root
 * does — so it cannot legitimately live there anymore now that `filesystems`
 * is itself Mechanism-B-enforced.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SANDBOX_SCAFFOLDING_PATHS } from "@hyperidle/filesystem-mounting";
import { provisionHarnessEnvironment } from "@hyperidle/harness-registry";
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
