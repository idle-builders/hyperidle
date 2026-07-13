/**
 * AL7 RED — classifyReversibility + composeWorkflowAllowDeny unit tests
 *
 * Tests FAIL until:
 *   - classifyReversibility(toolId, def) exported from tool-registry.ts
 *   - composeWorkflowAllowDeny(wf, allTools) exported from tool-registry.ts
 *   - identityHash(toolId, args) exported from tool-registry.ts
 *   - RegisteredTool.reversibility?: "irreversible" | "reversible" field added
 *   - commit_file tool registered in ALL_TOOL_DEFINITIONS with reversibility:"irreversible"
 *
 * Covers: AC1 (fail-closed: no-signal → irreversible), AC2 (reversible flows),
 *         AC4 (explicit annotation respected), AC5b (arg-pin convenience),
 *         Task 4 (classifier + composer + live-proof tool registration).
 */

import {
	ALL_TOOL_DEFINITIONS,
	classifyReversibility,
	composeWorkflowAllowDeny,
	identityHash,
} from "@hyperidle/agent-layer";
import type { SessionWorkflow } from "@hyperidle/shared";
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
// T3 — composeWorkflowAllowDeny: session-1 vs session-2 workflow composition
// ─────────────────────────────────────────────────────────────────────────────

describe("T3: composeWorkflowAllowDeny — session workflow policy (AC1/AC5)", () => {
	const mockTools = [
		{ name: "commit_file", reversibility: "irreversible" as const },
		{ name: "github_merge_pr", reversibility: "irreversible" as const },
		{ name: "read_file", reversibility: "reversible" as const },
		{ name: "write_notes", reversibility: "reversible" as const },
	];

	it("session-1 open-work: all irreversible tools in routeToReview, reversible in allow", () => {
		const wf: SessionWorkflow = {
			routeToReview: ["irreversible"],
			sessionRole: "open-work",
		};
		const { allow, routeToReview } = composeWorkflowAllowDeny(wf, mockTools);

		expect(routeToReview).toContain("commit_file");
		expect(routeToReview).toContain("github_merge_pr");
		expect(allow).toContain("read_file");
		expect(allow).toContain("write_notes");
		expect(allow).not.toContain("commit_file");
		expect(routeToReview).not.toContain("read_file");
	});

	it("session-2 grant-bearing: approved tool moves from routeToReview to allow", () => {
		const wf: SessionWorkflow = {
			routeToReview: ["irreversible"],
			sessionRole: "grant-bearing",
			approvedCall: {
				toolId: "commit_file",
				args: { path: "/workspace/out.txt", content: "done" },
				argPinned: false,
			},
		};
		const { allow, routeToReview } = composeWorkflowAllowDeny(wf, mockTools);

		// Approved tool is allowed; other irreversible tool still routes to review
		expect(allow).toContain("commit_file");
		expect(allow).toContain("read_file");
		expect(allow).toContain("write_notes");
		expect(routeToReview).toContain("github_merge_pr");
		expect(routeToReview).not.toContain("commit_file");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — commit_file live-proof tool registered (Task 4 — wired before Tasks 5-11)
// ─────────────────────────────────────────────────────────────────────────────

describe("T4: commit_file live-proof tool in ALL_TOOL_DEFINITIONS (Task 4)", () => {
	it("commit_file is in ALL_TOOL_DEFINITIONS", () => {
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		expect(names).toContain("commit_file");
	});

	it("commit_file has reversibility:'irreversible'", () => {
		const def = ALL_TOOL_DEFINITIONS.find((d) => d.name === "commit_file");
		expect(def).toBeDefined();
		// The reversibility annotation must be present (used by classifyReversibility)
		expect(def?.reversibility).toBe("irreversible");
	});

	it("NO kernel-executor tools in ALL_TOOL_DEFINITIONS (AC12 — no executor dispatch)", () => {
		// The v1 model's executor dispatch must be gone
		const names = ALL_TOOL_DEFINITIONS.map((d) => d.name);
		const forbidden = [
			"stage_operation", // v1 tool — retired
			"execute_operation",
			"dispatch_operation",
			"resolve_staged_operations",
		];
		for (const verb of forbidden) {
			expect(names, `ALL_TOOL_DEFINITIONS must not contain '${verb}'`).not.toContain(verb);
		}
	});
});
