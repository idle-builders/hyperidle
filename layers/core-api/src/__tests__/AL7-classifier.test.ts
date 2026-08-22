/**
 * AL7 RED — classifyReversibility + identityHash unit tests
 *
 * Tests FAIL until:
 *   - classifyReversibility(toolId, def) exported from tool-registry.ts
 *   - identityHash(toolId, args) exported from tool-registry.ts
 *   - RegisteredTool.reversibility?: "irreversible" | "reversible" field added
 *
 * Covers: AC1 (fail-closed: no-signal → irreversible), AC2 (reversible flows),
 *         AC4 (explicit annotation respected), AC5b (arg-pin convenience).
 */

import { classifyReversibility, identityHash } from "@hyperidle/tool-handlers";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// T1 — classifyReversibility: fail-closed (no signal → irreversible)
// ─────────────────────────────────────────────────────────────────────────────

describe("T1: classifyReversibility — fail-closed out of care (AC1)", () => {
	it("a tool with no reversibility field is classified irreversible", () => {
		const toolDef = {
			name: "unknown_tool",
			description: "Some tool",
			inputSchema: { safeParse: () => ({ success: true, data: {} }) },
			handler: async () => ({ ok: true, value: "x" }),
		};
		// No reversibility field → fail-closed: treat as irreversible
		// This routes consequential-looking calls to review — care, not suspicion.
		const result = classifyReversibility("unknown_tool", toolDef);
		expect(result).toBe("irreversible");
	});

	it("a tool with explicit reversibility:'irreversible' is classified irreversible", () => {
		const toolDef = {
			name: "commit_file",
			description: "Commits a file",
			inputSchema: { safeParse: () => ({ success: true, data: {} }) },
			handler: async () => ({ ok: true, value: "x" }),
			reversibility: "irreversible" as const,
		};
		expect(classifyReversibility("commit_file", toolDef)).toBe("irreversible");
	});

	it("a tool with explicit reversibility:'reversible' is classified reversible", () => {
		const toolDef = {
			name: "read_file",
			description: "Reads a file",
			inputSchema: { safeParse: () => ({ success: true, data: {} }) },
			handler: async () => ({ ok: true, value: "x" }),
			reversibility: "reversible" as const,
		};
		expect(classifyReversibility("read_file", toolDef)).toBe("reversible");
	});

	it("a tool with MCP destructiveHint:true and no explicit annotation is classified irreversible", () => {
		const toolDef = {
			name: "delete_record",
			description: "Deletes a record",
			inputSchema: { safeParse: () => ({ success: true, data: {} }) },
			handler: async () => ({ ok: true, value: "x" }),
			annotations: { destructiveHint: true },
		};
		expect(classifyReversibility("delete_record", toolDef)).toBe("irreversible");
	});

	it("a tool with MCP idempotentHint:true (and no destructive hint, no explicit annotation) is classified reversible", () => {
		const toolDef = {
			name: "idempotent_op",
			description: "Idempotent operation",
			inputSchema: { safeParse: () => ({ success: true, data: {} }) },
			handler: async () => ({ ok: true, value: "x" }),
			annotations: { idempotentHint: true },
		};
		expect(classifyReversibility("idempotent_op", toolDef)).toBe("reversible");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — identityHash: deterministic for same args, different for different args
// (optional arg-pin convenience — NOT a guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("T2: identityHash — deterministic metadata for the arg-pin convenience (AC5b)", () => {
	it("same toolId + same args produce the same hash (deterministic)", () => {
		const h1 = identityHash("commit_file", { path: "/workspace/out.txt", content: "hello" });
		const h2 = identityHash("commit_file", { path: "/workspace/out.txt", content: "hello" });
		expect(h1).toBe(h2);
	});

	it("same toolId + different args produce different hashes", () => {
		const h1 = identityHash("commit_file", { path: "/workspace/out.txt", content: "hello" });
		const h2 = identityHash("commit_file", { path: "/workspace/out.txt", content: "world" });
		expect(h1).not.toBe(h2);
	});

	it("different toolId with same args produce different hashes", () => {
		const h1 = identityHash("commit_file", { path: "/workspace/out.txt" });
		const h2 = identityHash("github_merge_pr", { path: "/workspace/out.txt" });
		expect(h1).not.toBe(h2);
	});

	it("key order in args does not affect hash (canonical JSON)", () => {
		const h1 = identityHash("commit_file", { path: "/workspace/out.txt", content: "hello" });
		const h2 = identityHash("commit_file", { content: "hello", path: "/workspace/out.txt" });
		// Canonical JSON sorts keys → identical hash regardless of key order
		expect(h1).toBe(h2);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — commit_file live-proof tool registered (Task 4 — wired before Tasks 5-11)
// ─────────────────────────────────────────────────────────────────────────────
