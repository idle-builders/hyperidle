/**
 * @lore AU20 K1-reads: listByScope() was deleted from knowledge-reader.ts and
 * inlined into list(db, {scope}) in knowledge-repository.ts. This test now uses
 * the general list() entry point.
 */
import { knowledgeItems } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { list } from "../knowledge-repository.js";

function seedRow(id: string, scopeKind: string, scopeId: string, title: string, updatedBy: string) {
	return {
		id,
		scopeKind,
		scopeId,
		title,
		body: `${title} body`,
		format: "md",
		status: "active",
		updatedBy,
		createdAt: "2026-07-13T00:00:00Z",
		updatedAt: "2026-07-13T00:00:00Z",
	};
}

test("list({scope}) returns knowledge items in the requested scope only", async ({ db, ids }) => {
	await db
		.insert(knowledgeItems)
		.values([
			seedRow(ids("ki-1"), "team", ids("t1"), "Team playbook", ids("u1")),
			seedRow(ids("ki-2"), "team", ids("t2"), "Other team", ids("u1")),
			seedRow(ids("ki-3"), "factory", "", "Factory default", ids("u1")),
		]);

	const teamT1 = await list(db, { scope: { scopeKind: "team", scopeId: ids("t1") } });
	expect(teamT1.map((k) => k.id)).toEqual([ids("ki-1")]);

	// @lore AU38: a scopeKind-only filter is a global read by design — in a
	// populated world it also returns other tests' team-scoped items. Scoped to
	// this test's own rows (its updatedBy), the exact-list claim survives;
	// derived UUIDs don't sort in label order, so both sides sort alike.
	const allTeamKind = await list(db, { scope: { scopeKind: "team" } });
	expect(
		allTeamKind
			.filter((k) => k.updatedBy === ids("u1"))
			.map((k) => k.id)
			.sort(),
	).toEqual([ids("ki-1"), ids("ki-2")].sort());
});
