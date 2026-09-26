/**
 * `listInjectedFilesystemsForProvisioning` is the LIVE, in-layer injected-
 * filesystem read a spawn performs — the twin of
 * `listHeldConnectionsForProvisioning`. Test 1 is a hand-written regression
 * pin against the fixture data: the EXACT shape `routes/filesystems.ts`'s
 * `rowToFilesystem` mapping produces (parsed `resourceRef`, same field set),
 * never re-derived from the function under test itself.
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
		await db.insert(teams).values({ id: "team-rifa-1", name: "RIFA Team", createdAt: NOW });
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
			writeback: "file",
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
				writeback: "file",
				state: "attached",
				createdAt: NOW,
			},
		]);
	});

	test("an agent with multiple injected filesystems gets every one back, in the same shape", async ({
		db,
	}) => {
		await db.insert(teams).values({ id: "team-rifa-2", name: "RIFA Team 2", createdAt: NOW });
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

		const result = await listInjectedFilesystemsForProvisioning(db, "agent-rifa-3");

		expect(result).toEqual([]);
	});
});
