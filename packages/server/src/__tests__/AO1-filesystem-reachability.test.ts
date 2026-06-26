/**
 * AO1 RED — Unit tests for the filesystem reachability pure function and
 * the FilesystemAuthResolver seam (NoopAuthResolver).
 *
 * These tests FAIL until:
 *   - `packages/server/src/services/filesystem-reachability.ts` is created
 *     and exports `resolveFilesystemState`.
 *   - `packages/server/src/services/noop-auth-resolver.ts` (or same file)
 *     exports `NoopAuthResolver` implementing `FilesystemAuthResolver`.
 *   - `packages/shared/src/filesystem.ts` exports `FILESYSTEM_KINDS`,
 *     `WRITEBACK_MODES`, `SUBSTRATE_STATES`, and the `FilesystemAuthResolver` interface.
 *
 * Coverage:
 *   AC5  — resolveFilesystemState: writeback:none → reachable; local → reachable;
 *            NoopAuthResolver + connectionId → needs_attention; fake resolver → reachable
 *   AC3  — FILESYSTEM_KINDS does not include SoR kinds
 *   AC2  — FilesystemAuthResolver seam: canResolve / sourceOf / resolve shape
 *
 * Source of truth: plans/AO1/architecture.md §3 reachability block + §4 seam
 */

import { FILESYSTEM_KINDS, WRITEBACK_MODES } from "@hyperidle/shared";
import { describe, expect, it } from "vitest";
// These imports will FAIL (red) until the green-phase implementation creates these files.
// We import via the path the architecture specifies (Task T4).
import { NoopAuthResolver, resolveFilesystemState } from "../services/filesystem-reachability.js";

// ─── resolveFilesystemState ──────────────────────────────────────────────────

describe("resolveFilesystemState — pure reachability logic (AC5)", () => {
	it("writeback:'none' → 'reachable' regardless of connectionId", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-1",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-abc",
				resourceRef: JSON.stringify({ kind: "code", repo: "owner/r", branch: "main" }),
				writeback: "none",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("reachable");
	});

	it("bare-local (connectionId null) → 'reachable'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-2",
				teamId: "team-1",
				source: "local",
				kind: "code",
				connectionId: null,
				resourceRef: JSON.stringify({ kind: "code", repo: "/home/user/repo", branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("reachable");
	});

	it("connection-backed + NoopAuthResolver → 'needs_attention'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-3",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-missing",
				resourceRef: JSON.stringify({ kind: "code", repo: "owner/repo", branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("needs_attention");
	});

	it("connection-backed + real resolver (canResolve=true) → 'reachable'", async () => {
		// A fake resolver that always resolves: simulates AN providing a real resolver
		const fakeResolver = {
			canResolve: async (_connectionId: string) => true,
			sourceOf: async (_connectionId: string) => "github",
			resolve: async (_connectionId: string) => ({
				connectionId: _connectionId,
				provision: { mode: "none" as const },
			}),
		};

		const state = await resolveFilesystemState(
			{
				id: "fs-4",
				teamId: "team-1",
				source: "github",
				kind: "code",
				connectionId: "conn-real",
				resourceRef: JSON.stringify({ kind: "code", repo: "owner/repo", branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: fakeResolver },
		);
		expect(state).toBe("reachable");
	});

	it("doc_set + connectionId + NoopAuthResolver → 'needs_attention'", async () => {
		const state = await resolveFilesystemState(
			{
				id: "fs-5",
				teamId: "team-1",
				source: "gdrive",
				kind: "doc_set",
				connectionId: "conn-gdrive",
				resourceRef: JSON.stringify({ kind: "doc_set", folder: "/notes" }),
				writeback: "file",
				state: "attached",
				createdAt: "2026-06-26T00:00:00.000Z",
			},
			{ authResolver: new NoopAuthResolver() },
		);
		expect(state).toBe("needs_attention");
	});
});

// ─── NoopAuthResolver ────────────────────────────────────────────────────────

describe("NoopAuthResolver seam (AC2 / AC5)", () => {
	it("canResolve always returns false (no AN connection table)", async () => {
		const resolver = new NoopAuthResolver();
		expect(await resolver.canResolve("any-connection-id")).toBe(false);
	});

	it("sourceOf always returns null (cannot derive source without AN)", async () => {
		const resolver = new NoopAuthResolver();
		expect(await resolver.sourceOf("any-connection-id")).toBeNull();
	});

	it("resolve always returns null (cannot provision auth without AN)", async () => {
		const resolver = new NoopAuthResolver();
		expect(await resolver.resolve("any-connection-id")).toBeNull();
	});
});

// ─── FILESYSTEM_KINDS shared constant (AC3) ──────────────────────────────────

describe("FILESYSTEM_KINDS constant (AC3)", () => {
	it("includes 'code' and 'doc_set'", () => {
		expect(FILESYSTEM_KINDS).toContain("code");
		expect(FILESYSTEM_KINDS).toContain("doc_set");
	});

	it("does NOT include systems-of-record kinds", () => {
		const kinds = FILESYSTEM_KINDS as readonly string[];
		expect(kinds).not.toContain("inbox");
		expect(kinds).not.toContain("crm");
		expect(kinds).not.toContain("ticket_queue");
		expect(kinds).not.toContain("email");
		expect(kinds).not.toContain("calendar");
	});
});

// ─── WRITEBACK_MODES shared constant ─────────────────────────────────────────

describe("WRITEBACK_MODES constant", () => {
	it("includes 'git', 'file', 'none'", () => {
		expect(WRITEBACK_MODES).toContain("git");
		expect(WRITEBACK_MODES).toContain("file");
		expect(WRITEBACK_MODES).toContain("none");
	});
});
