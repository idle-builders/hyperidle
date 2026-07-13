import { knowledgeItems } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { list } from "./knowledge-reader.js";

function seedRow(id: string, scopeKind: string, scopeId: string, title: string) {
	return {
		id,
		scopeKind,
		scopeId,
		title,
		body: `${title} body`,
		format: "md",
		status: "active",
		updatedBy: "u1",
		createdAt: "2026-07-13T00:00:00Z",
		updatedAt: "2026-07-13T00:00:00Z",
	};
}

test("list() returns knowledge items in the requested scope only", async ({ db }) => {
	await db
		.insert(knowledgeItems)
		.values([
			seedRow("ki-1", "team", "t1", "Team playbook"),
			seedRow("ki-2", "team", "t2", "Other team"),
			seedRow("ki-3", "factory", "", "Factory default"),
		]);

	const teamT1 = await list(db, { scopeKind: "team", scopeId: "t1" });
	expect(teamT1.map((k) => k.id)).toEqual(["ki-1"]);

	const allTeamKind = await list(db, { scopeKind: "team" });
	expect(allTeamKind.map((k) => k.id).sort()).toEqual(["ki-1", "ki-2"]);
});
