/**
 * AK1 — AGENTS.md dual-write: unit tests (RED phase)
 *
 * Per plan §AGENTS.md (WARNING-2 resolution — dual-write DEFAULT):
 * The sandbox setup must write BOTH AGENTS.md AND CLAUDE.md with identical content.
 *
 * writeSandboxAgentsMd(sandboxPath, assembledPrompt) is the renamed function from
 * writeWorkspaceCLAUDEmd(sandboxPath, assembledPrompt).
 *
 * RED PHASE: Fails until:
 *   - context-assembly-prompt.ts exports writeSandboxAgentsMd() (renamed from writeWorkspaceCLAUDEmd)
 *   - writeSandboxAgentsMd() writes BOTH AGENTS.md AND CLAUDE.md to sandboxPath
 *   - writeSandboxAgentsMd() param is sandboxPath
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

// @lore AK1: importing the renamed function — RED until writeSandboxAgentsMd is exported from context-assembly-prompt.ts.
// Import the module as a namespace so we can access the (not-yet-exported) function at runtime
// without a compile-time error blocking the RED phase.
import * as PromptComposition from "../context-assembly-prompt.js";

/** Cast helper — fails at runtime with "writeSandboxAgentsMd is not a function" until green phase. */
const writeSandboxAgentsMd = (
	PromptComposition as unknown as {
		writeSandboxAgentsMd: (sandboxPath: string, content: string) => void;
	}
).writeSandboxAgentsMd;

describe("AK1 — writeSandboxAgentsMd dual-write", () => {
	let tmpDir: string;

	beforeEach(() => {
		// Create a fresh temporary sandbox directory for each test
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ak1-test-sandbox-"));
	});

	afterEach(() => {
		// Clean up temp directory
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	test("writes AGENTS.md to the sandbox root", () => {
		const content = "# System Prompt\n\nYou are the Builder.";
		writeSandboxAgentsMd(tmpDir, content);

		const agentsMdPath = path.join(tmpDir, "AGENTS.md");
		expect(fs.existsSync(agentsMdPath)).toBe(true);
		expect(fs.readFileSync(agentsMdPath, "utf8")).toBe(content);
	});

	test("writes CLAUDE.md to the sandbox root (compatibility dual-write)", () => {
		const content = "# System Prompt\n\nYou are the Builder.";
		writeSandboxAgentsMd(tmpDir, content);

		const claudeMdPath = path.join(tmpDir, "CLAUDE.md");
		expect(fs.existsSync(claudeMdPath)).toBe(true);
		expect(fs.readFileSync(claudeMdPath, "utf8")).toBe(content);
	});

	test("AGENTS.md and CLAUDE.md have identical content", () => {
		const content = "# System Prompt\n\nYou are the Builder.\n\n## Task\n\nDo the thing.";
		writeSandboxAgentsMd(tmpDir, content);

		const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
		const claudeMd = fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf8");
		expect(agentsMd).toBe(claudeMd);
	});

	test("accepts sandboxPath as first parameter", () => {
		// This is a type-level check — the function must accept sandboxPath.
		// If the function signature still uses the old semantics,
		// the rename would be incomplete. This test uses a valid directory so
		// it actually executes, proving the param is used correctly.
		const content = "# Test";
		// Should not throw — sandboxPath is passed as first arg
		expect(() => writeSandboxAgentsMd(tmpDir, content)).not.toThrow();
	});

	test("writes empty string content to both files without error", () => {
		writeSandboxAgentsMd(tmpDir, "");

		expect(fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8")).toBe("");
		expect(fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf8")).toBe("");
	});

	test("overwrites existing AGENTS.md and CLAUDE.md (idempotent)", () => {
		const firstContent = "# First write";
		const secondContent = "# Second write";

		writeSandboxAgentsMd(tmpDir, firstContent);
		writeSandboxAgentsMd(tmpDir, secondContent);

		expect(fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8")).toBe(secondContent);
		expect(fs.readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf8")).toBe(secondContent);
	});
});
