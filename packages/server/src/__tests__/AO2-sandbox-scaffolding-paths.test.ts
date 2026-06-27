/**
 * AO2 — Unit tests for SANDBOX_SCAFFOLDING_PATHS constant + per-writer membership.
 *
 * The shared constant is the single source of truth for the capture-exclude list.
 * A writer that writes to a root path NOT in this constant silently drifts off
 * the exclude list — the next capture will leak its output (including, on the
 * codex path, `.codex-home/auth.json`). These tests enforce the drift-proof contract.
 *
 * Covers:
 *   - SANDBOX_SCAFFOLDING_PATHS has exactly 12 entries (incl. CLAUDE.md + .codex-home/).
 *   - Each of the four writer files' literal dir/file names ∈ SANDBOX_SCAFFOLDING_PATHS.
 *     Writer files (per architecture §5b·0):
 *       1. context-assembly.ts  → .fabric/, context/, knowledge/, work/
 *       2. context-assembly-prompt.ts → AGENTS.md, CLAUDE.md
 *       3. cli-mcp-config.ts → .codex-home/, opencode.json
 *       4. provision-return-hook.ts → .claude/, .codex/, .codex-home/, .opencode/
 *     (session-provisioning Phase 8b → .mcp.json)
 *
 * Test type: unit (*.test.ts) — imports constants + writer functions, asserts set membership.
 * Static codebase properties enforced here as runtime assertions (not readFileSync grep) —
 * the test IMPORTS the constant from the module and checks via includes().
 *
 * Source of truth: plans/AO2/architecture.md §5b·0 + architecture-critique residual nits.
 */

import { describe, expect, it } from "vitest";
import { SANDBOX_SCAFFOLDING_PATHS } from "@hyperidle/shared";

// ─── Invariant: 12-entry inventory is complete ───────────────────────────────

describe("SANDBOX_SCAFFOLDING_PATHS — constant exists and is complete (§5b·0)", () => {
	it("SANDBOX_SCAFFOLDING_PATHS is exported from @hyperidle/shared", () => {
		// This FAILS until the constant is added to packages/shared/src/filesystem.ts.
		expect(SANDBOX_SCAFFOLDING_PATHS).toBeDefined();
		expect(Array.isArray(SANDBOX_SCAFFOLDING_PATHS)).toBe(true);
	});

	it("has exactly 12 entries covering the complete verified writer set", () => {
		// Verify the full 12-entry inventory from architecture §5b·0.
		// A count mismatch means a writer was added without updating the constant (drift).
		expect(SANDBOX_SCAFFOLDING_PATHS).toHaveLength(12);
	});

	it("includes CLAUDE.md (dual-write from context-assembly-prompt.ts — @lore AK1)", () => {
		// CLAUDE.md fell off the exclude list in rev2. Explicitly asserting it prevents re-drift.
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("CLAUDE.md");
	});

	it("includes .codex-home/ (credential dir from provision-return-hook.ts — @lore AL6)", () => {
		// .codex-home/ fell off the exclude list in rev2.
		// Its absence means .codex-home/auth.json reaches the bundle — the load-bearing leak.
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".codex-home/");
	});

	it("includes AGENTS.md, .mcp.json, .claude/, .codex/, opencode.json, .opencode/", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("AGENTS.md");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".mcp.json");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".claude/");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".codex/");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("opencode.json");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".opencode/");
	});

	it("includes .fabric/, context/, knowledge/, work/ (context-assembly.ts dirs)", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".fabric/");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("context/");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("knowledge/");
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("work/");
	});
});

// ─── Per-writer assertions (architecture-critique nit: must cover all 4 files individually) ─

describe("Writer 1 — context-assembly.ts writes ∈ SANDBOX_SCAFFOLDING_PATHS", () => {
	it(".fabric/ is in the constant (assembleContext writes manifest here)", () => {
		// context-assembly.ts:91 createDirectoryStructure('.fabric')
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".fabric/");
	});

	it("context/ is in the constant (context-assembly.ts:92-94)", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("context/");
	});

	it("knowledge/ is in the constant (context-assembly.ts:95-97)", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("knowledge/");
	});

	it("work/ is in the constant (context-assembly.ts:98 + task-notes.md)", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("work/");
	});
});

describe("Writer 2 — context-assembly-prompt.ts writes ∈ SANDBOX_SCAFFOLDING_PATHS", () => {
	it("AGENTS.md is in the constant (writeSandboxAgentsMd:278 dual-write)", () => {
		// context-assembly-prompt.ts:278 fs.writeFileSync(path.join(sandboxPath, 'AGENTS.md'), ...)
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("AGENTS.md");
	});

	it("CLAUDE.md is in the constant (writeSandboxAgentsMd:279 dual-write — @lore AK1)", () => {
		// context-assembly-prompt.ts:279 fs.writeFileSync(path.join(sandboxPath, 'CLAUDE.md'), ...)
		// The @lore AK1 dual-write writes BOTH files every session.
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("CLAUDE.md");
	});
});

describe("Writer 3 — cli-mcp-config.ts writes ∈ SANDBOX_SCAFFOLDING_PATHS", () => {
	it(".codex-home/ is in the constant (writeCodexToml writes to .codex-home/config.toml)", () => {
		// cli-mcp-config.ts:87 path.join(sandboxPath, '.codex-home')
		// This is ALSO written by provision-return-hook.ts — both assert it independently.
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".codex-home/");
	});

	it("opencode.json is in the constant (writeOpencodeJson:122)", () => {
		// cli-mcp-config.ts:122 path.join(sandboxPath, 'opencode.json')
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain("opencode.json");
	});
});

describe("Writer 4 — provision-return-hook.ts writes ∈ SANDBOX_SCAFFOLDING_PATHS", () => {
	it(".claude/ is in the constant (provisionClaudeSettings:118)", () => {
		// provision-return-hook.ts:118 path.join(sandboxPath, '.claude')
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".claude/");
	});

	it(".codex/ is in the constant (provisionCodexHome writes .codex/hooks.json)", () => {
		// provision-return-hook.ts:198 path.join(sandboxPath, '.codex') backward-compat
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".codex/");
	});

	it(".codex-home/ is in the constant (provisionCodexHome:222 — auth.json CREDENTIAL, @lore AL6)", () => {
		// provision-return-hook.ts:222 creates .codex-home/ and copies auth.json
		// from ~/.codex — a REAL HOST CREDENTIAL. If this is off the exclude list,
		// the credential reaches the durable bundle (the load-bearing STRIDE leak).
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".codex-home/");
	});

	it(".opencode/ is in the constant (provision-return-hook.ts opencode plugin path)", () => {
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".opencode/");
	});
});

// ─── Writer 5 — session-provisioning Phase 8b ────────────────────────────────

describe("Writer 5 — session-provisioning.ts Phase 8b writes ∈ SANDBOX_SCAFFOLDING_PATHS", () => {
	it(".mcp.json is in the constant (session-provisioning.ts:753 internal MCP config)", () => {
		// session-provisioning.ts:752-753 fs.writeFileSync(path.join(sandboxPath, '.mcp.json'), ...)
		expect(SANDBOX_SCAFFOLDING_PATHS).toContain(".mcp.json");
	});
});
