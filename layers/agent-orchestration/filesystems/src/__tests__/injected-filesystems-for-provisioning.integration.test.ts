/**
 * AU26 F2 — the LIVE, in-layer injected-filesystem read one spawn performs.
 *
 * AU21 §9 Increment 12 introduced this function as an EMIT-TIME bake helper
 * (`resolveInjectedFilesystemsForAgent`), because `filesystems` /
 * `filesystem_injections` still lived in core-api and `run-orchestration` was
 * forbidden to read them. The founder's 2026-08-04 ruling moved both tables
 * into this Layer, so the same query is now what a spawn runs directly —
 * renamed `listInjectedFilesystemsForProvisioning`, the twin of E3's
 * `listHeldConnectionsForProvisioning`.
 *
 * The behaviour these cases pin did NOT change with the rename, which is the
 * point: test 1 is a real regression PIN written out by hand against the
 * fixture data — the EXACT shape `routes/filesystems.ts`'s `rowToFilesystem`
 * mapping produces (parsed `resourceRef`, same field set) — never re-derived
 * from the function under test itself. What a session gets mounted is
 * byte-identical; only WHEN it is read moved.
 */

import { filesystemInjections, filesystems as filesystemsTable, teams, users } from "@hyperidle/db";
import { test } from "@hyperidle/db/test-fixtures";
import { describe, expect } from "vitest";
import { listInjectedFilesystemsForProvisioning } from "../index.js";

const NOW = "2026-08-02T00:00:00.000Z";

describe("listInjectedFilesystemsForProvisioning reads an agent's injected filesystems live at spawn", () => {
	test("matches EXACTLY what the route's `filesystem_injections -> filesystems` join returns for a fixed agent/team/injection fixture", async ({
		db,
	}) => {
		await db
			.insert(teams)
			.values({ id: "team-rifa-1", name: "RIFA Team", phase: "build", createdAt: NOW });
		// The owner writes the membership row alongside the team.
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
			state: "attached",
			createdAt: NOW,
		});
		await db.insert(filesystemInjections).values({
			agentUserId: "agent-rifa-1",
			filesystemId: "fs-rifa-1",
			createdAt: NOW,
		});

		const result = await listInjectedFilesystemsForProvisioning(db, "agent-rifa-1");

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
				state: "attached",
				attentionReason: null,
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
		// The owner writes the membership row alongside the team.
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
				state: "reachable",
				createdAt: NOW,
			},
		]);
		await db.insert(filesystemInjections).values([
			{ agentUserId: "agent-rifa-2", filesystemId: "fs-rifa-2a", createdAt: NOW },
			{ agentUserId: "agent-rifa-2", filesystemId: "fs-rifa-2b", createdAt: NOW },
		]);

		const result = await listInjectedFilesystemsForProvisioning(db, "agent-rifa-2");

		expect(result).toHaveLength(2);
		const byId = new Map(result.map((row) => [row.id, row]));
		expect(byId.get("fs-rifa-2a")).toEqual({
			id: "fs-rifa-2a",
			teamId: "team-rifa-2",
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: { kind: "code", repo: "org/repo", branch: "main" },
			state: "attached",
			attentionReason: null,
			createdAt: NOW,
		});
		expect(byId.get("fs-rifa-2b")).toEqual({
			id: "fs-rifa-2b",
			teamId: "team-rifa-2",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: { kind: "doc_set", folder: "/notes" },
			state: "reachable",
			attentionReason: null,
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

		const result = await listInjectedFilesystemsForProvisioning(db, "agent-rifa-3");

		expect(result).toEqual([]);
	});
});
