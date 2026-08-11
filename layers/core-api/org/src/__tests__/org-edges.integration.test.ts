/**
 * AH4 — Unit tests: upsertOrgEdge helper.
 *
 * AC4: The helper is idempotent — calling it twice with the same tuple returns
 *      created:false on the second call, and only one row exists in the DB.
 *
 * Uses the DB fixture (PGlite in-process, TRUNCATE between tests).
 *
 * @lore AU19 Increment 1c: moved from `packages/server/src/services/__tests__/
 * org-edges.integration.test.ts` — this test only needs `{ db }` (no `{ app }`),
 * so it moves into the owning package's own `src/__tests__/` and switches its
 * fixture import from `packages/server`'s `{ db, app, eventBus }` fixture to
 * `@hyperidle/db/test-fixtures`'s `{ db }`-only fixture, same precedent as
 * `@hyperidle/knowledge`'s `knowledge-reader.integration.test.ts`.
 */

import { orgEdges, teamMembers, teams, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { upsertOrgEdge } from "../org-edges.js";

const NOW = new Date().toISOString();

describe("upsertOrgEdge — idempotency", () => {
	test("first call returns created:true, second returns created:false with same id", async ({
		db,
		ids,
	}) => {
		// Seed prerequisite rows
		await db.insert(teams).values({
			id: ids("oe-team-1"),
			name: "OE Team",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(teamMembers).values({
			id: ids("oe-tm-1"),
			teamId: ids("oe-team-1"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: ids("oe-human-1"),
			kind: "human",
			name: "OE Founder",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const input = {
			fromUserId: ids("oe-human-1"),
			mechanism: "team" as const,
			target: ids("oe-tm-1"),
		};

		// First call → creates
		const first = await upsertOrgEdge(db, input);
		expect(first.created).toBe(true);
		expect(typeof first.edge.id).toBe("string");
		expect(first.edge.fromUserId).toBe(ids("oe-human-1"));
		expect(first.edge.mechanism).toBe("team");
		expect(first.edge.target).toBe(ids("oe-tm-1"));

		// Second call → returns existing, no new row
		const second = await upsertOrgEdge(db, input);
		expect(second.created).toBe(false);
		expect(second.edge.id).toBe(first.edge.id);
	});

	test("exactly one DB row after two calls with the same tuple", async ({ db, ids }) => {
		await db.insert(teams).values({
			id: ids("oe-team-2"),
			name: "OE Team 2",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(teamMembers).values({
			id: ids("oe-tm-2"),
			teamId: ids("oe-team-2"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: ids("oe-human-2"),
			kind: "human",
			name: "OE Founder 2",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const input = {
			fromUserId: ids("oe-human-2"),
			mechanism: "team" as const,
			target: ids("oe-tm-2"),
		};

		await upsertOrgEdge(db, input);
		await upsertOrgEdge(db, input);

		// Scope the read to this test's own edge anchor (AU38 P1): in a populated
		// world other tests' org_edges rows exist.
		const rows = await db
			.select()
			.from(orgEdges)
			.where(eq(orgEdges.fromUserId, ids("oe-human-2")));
		const matching = rows.filter(
			(r) =>
				r.fromUserId === ids("oe-human-2") && r.mechanism === "team" && r.target === ids("oe-tm-2"),
		);
		expect(matching).toHaveLength(1);
	});

	test("different tuples produce separate rows", async ({ db, ids }) => {
		await db.insert(teams).values({
			id: ids("oe-team-3a"),
			name: "OE Team 3a",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(teamMembers).values({
			id: ids("oe-tm-3a"),
			teamId: ids("oe-team-3a"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(teams).values({
			id: ids("oe-team-3b"),
			name: "OE Team 3b",
			phase: "build",
			createdAt: NOW,
		});
		await db.insert(teamMembers).values({
			id: ids("oe-tm-3b"),
			teamId: ids("oe-team-3b"),
			capacity: 5,
			activeBets: 0,
			formedAt: NOW,
		});
		await db.insert(users).values({
			id: ids("oe-human-3"),
			kind: "human",
			name: "OE Founder 3",
			role: "founder",
			status: "active",
			createdAt: NOW,
		});

		const a = await upsertOrgEdge(db, {
			fromUserId: ids("oe-human-3"),
			mechanism: "team",
			target: ids("oe-tm-3a"),
		});
		const b = await upsertOrgEdge(db, {
			fromUserId: ids("oe-human-3"),
			mechanism: "team",
			target: ids("oe-tm-3b"),
		});

		expect(a.created).toBe(true);
		expect(b.created).toBe(true);
		expect(a.edge.id).not.toBe(b.edge.id);
	});
});
