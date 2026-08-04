/**
 * AU21 §9 Increment 12 follow-up (F2 gap closure) — RED phase.
 *
 * Decision H3 already established the pattern (task/bet/team/routine content,
 * ranked knowledge, agentConfig/harnessDisabled) — bake everything a session
 * needs at EMIT time, keyed off the resolved agentId, so run-orchestration
 * never reads core-api back at provisioning time. Decision F2 (Increment 8)
 * left ONE seam call standing that H3's later, more complete principle
 * should have superseded but never revisited:
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`, backed by
 * `GET /filesystems?agentUserId=` (`routes/filesystems.ts`), which resolves
 * `sessions.agentId -> filesystem_injections -> filesystems` via
 * `listFilesystems(db, {agentId})` + `rowToFilesystem`'s parsed-`resourceRef`
 * mapping.
 *
 * This test targets `resolveInjectedFilesystemsForAgent(db, agentId)` — a
 * NEW shared helper this Service (`@hyperidle/filesystems`, already the
 * domain owner) exposes so every per-kind emit-time resolver can bake the
 * agent's injected filesystem list onto the request payload via ordinary
 * same-layer core-api DI (never a new port, never a live read at
 * provisioning time). It does not exist yet — every test below fails at
 * IMPORT-RESOLUTION time (`resolveInjectedFilesystemsForAgent` is not
 * exported from `../index.js`). RED for the right reason: the helper has not
 * been built yet.
 *
 * Test 1 is a real regression PIN, not a compile-check: the expected value is
 * written out by hand against the fixture data — the EXACT shape the OLD
 * `GET /api/filesystems?agentUserId=` route's `rowToFilesystem` mapping
 * produces (parsed `resourceRef`, same field set — see
 * `core-api-port-increment8-connections-filesystems.integration.test.ts` for
 * the seam-level proof of that OLD behavior) — never re-derived from the
 * function under test itself.
 */

import { filesystemInjections, filesystems as filesystemsTable, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
// biome-ignore lint/correctness/noUnresolvedImports: RED phase — helper does not exist yet in this pass.
import { resolveInjectedFilesystemsForAgent } from "../index.js";

const NOW = "2026-08-02T00:00:00.000Z";

describe("resolveInjectedFilesystemsForAgent bakes an agent's injected filesystems at emit time", () => {
	test("matches EXACTLY what the OLD seam-based lookup (filesystem_injections -> filesystems join) returned for a fixed agent/team/injection fixture", async ({
		db,
	}) => {
		await db
			.insert(teams)
			.values({ id: "team-rifa-1", name: "RIFA Team", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "agent-rifa-1",
			kind: "ai",
			name: "RIFA Agent",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(filesystemsTable).values({
			id: "fs-rifa-1",
			teamId: "team-rifa-1",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: JSON.stringify({ kind: "doc_set", folder: "/docs" }),
			writeback: "file",
			state: "attached",
			createdAt: NOW,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: "agent-rifa-1",
			filesystemId: "fs-rifa-1",
			createdAt: NOW,
		});

		const result = await resolveInjectedFilesystemsForAgent(db, "agent-rifa-1");

		// Pinned by hand against the fixture above — the OLD route's
		// `rowToFilesystem` shape, `resourceRef` already parsed.
		expect(result).toEqual([
			{
				id: "fs-rifa-1",
				teamId: "team-rifa-1",
				source: "local",
				kind: "doc_set",
				connectionId: null,
				resourceRef: { kind: "doc_set", folder: "/docs" },
				writeback: "file",
				state: "attached",
				createdAt: NOW,
			},
		]);
	});

	test("an agent with multiple injected filesystems gets every one back, in the same shape", async ({
		db,
	}) => {
		await db
			.insert(teams)
			.values({ id: "team-rifa-2", name: "RIFA Team 2", phase: "build", createdAt: NOW });
		await db.insert(users).values({
			id: "agent-rifa-2",
			kind: "ai",
			name: "RIFA Agent 2",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});
		await db.insert(filesystemsTable).values([
			{
				id: "fs-rifa-2a",
				teamId: "team-rifa-2",
				source: "local",
				kind: "code",
				connectionId: null,
				resourceRef: JSON.stringify({ kind: "code", repo: "org/repo", branch: "main" }),
				writeback: "git",
				state: "attached",
				createdAt: NOW,
			},
			{
				id: "fs-rifa-2b",
				teamId: "team-rifa-2",
				source: "local",
				kind: "doc_set",
				connectionId: null,
				resourceRef: JSON.stringify({ kind: "doc_set", folder: "/notes" }),
				writeback: "none",
				state: "reachable",
				createdAt: NOW,
			},
		]);
		await db.insert(filesystemInjections).values([
			{ agentUserId: "agent-rifa-2", filesystemId: "fs-rifa-2a", createdAt: NOW },
			{ agentUserId: "agent-rifa-2", filesystemId: "fs-rifa-2b", createdAt: NOW },
		]);

		const result = await resolveInjectedFilesystemsForAgent(db, "agent-rifa-2");

		expect(result).toHaveLength(2);
		const byId = new Map(result.map((row) => [row.id, row]));
		expect(byId.get("fs-rifa-2a")).toEqual({
			id: "fs-rifa-2a",
			teamId: "team-rifa-2",
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: { kind: "code", repo: "org/repo", branch: "main" },
			writeback: "git",
			state: "attached",
			createdAt: NOW,
		});
		expect(byId.get("fs-rifa-2b")).toEqual({
			id: "fs-rifa-2b",
			teamId: "team-rifa-2",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: { kind: "doc_set", folder: "/notes" },
			writeback: "none",
			state: "reachable",
			createdAt: NOW,
		});
	});

	test("an agent with NO injected filesystems resolves an empty list, not a throw", async ({
		db,
	}) => {
		await db.insert(users).values({
			id: "agent-rifa-3",
			kind: "ai",
			name: "RIFA Agent 3",
			role: "builder",
			status: "active",
			createdAt: NOW,
		});

		const result = await resolveInjectedFilesystemsForAgent(db, "agent-rifa-3");

		expect(result).toEqual([]);
	});
});
