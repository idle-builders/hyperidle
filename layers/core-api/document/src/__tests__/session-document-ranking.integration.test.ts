/**
 * `assembleSessionDocuments` ranking — task description tag match lifts a
 * document above an otherwise-equal one.
 */
import { documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionDocuments } from "../session-documents.js";

const AGENT_ID = "agent-ranking-probe";
const NOW = "2026-01-01T00:00:00.000Z";

async function seed(db: HyperIdleDb): Promise<void> {
	await db.insert(documents).values([
		{
			id: "doc-matching",
			scopeKind: "factory",
			scopeId: null,
			// Title contains "authentication" — matches task description below.
			title: "Authentication patterns",
			body: "How we handle auth.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: AGENT_ID,
			createdAt: NOW,
			updatedAt: NOW,
		},
		{
			id: "doc-unrelated",
			scopeKind: "factory",
			scopeId: null,
			// Title has no overlap with task description.
			title: "Unrelated topic xyzzy",
			body: "Nothing relevant.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: AGENT_ID,
			createdAt: NOW,
			updatedAt: NOW,
		},
	]);
}

describe("assembleSessionDocuments — tag match raises ranking", () => {
	test("document matching task description terms ranks above an otherwise-equal one", async ({
		db,
	}) => {
		await seed(db);
		const result = await assembleSessionDocuments(db, {
			taskDescription: "Implement authentication for the API",
			agentId: AGENT_ID,
		});
		const ids = result.map((d) => d.id);
		const matchingIdx = ids.indexOf("doc-matching");
		const unrelatedIdx = ids.indexOf("doc-unrelated");
		expect(matchingIdx).not.toBe(-1);
		expect(unrelatedIdx).not.toBe(-1);
		expect(matchingIdx).toBeLessThan(unrelatedIdx);
	});
});
