/**
 * The discipline filter (not a rank boost — founder: "filter"): an agent
 * receives a document/skill whose own `discipline` is null/empty or matches
 * its own, case-insensitively. Proven against two agents of different
 * disciplines sharing one factory-wide corpus.
 */
import { documents, type HyperIdleDb } from "@hyperidle/db";
import { describe, expect, test } from "@hyperidle/db/test-fixtures";
import { assembleSessionDocuments } from "../session-documents.js";

function generateId(): string {
	return `test-${Math.random().toString(36).slice(2, 10)}`;
}

async function insertDocument(
	db: HyperIdleDb,
	opts: {
		id: string;
		title: string;
		body: string;
		slot: "ordinary" | "skill";
		discipline?: string | null;
	},
): Promise<void> {
	const now = new Date().toISOString();
	await db.insert(documents).values({
		id: opts.id,
		scopeKind: "factory",
		scopeId: null,
		title: opts.title,
		body: opts.body,
		format: "markdown",
		status: "active",
		slot: opts.slot,
		discipline: opts.discipline ?? null,
		version: 1,
		updatedBy: "test-user",
		createdAt: now,
		updatedAt: now,
	});
}

describe("assembleSessionDocuments — the discipline filter", () => {
	test("an agent gets its own discipline's document and skill plus the untagged one, never the other discipline's", async ({
		db,
	}) => {
		await insertDocument(db, {
			id: "doc-design",
			title: "Design practice",
			body: "For designers.",
			slot: "ordinary",
			discipline: "design",
		});
		await insertDocument(db, {
			id: "doc-builder",
			title: "Builder practice",
			body: "For builders.",
			slot: "ordinary",
			discipline: "builder",
		});
		await insertDocument(db, {
			id: "doc-untagged",
			title: "Everyone practice",
			body: "For everyone.",
			slot: "ordinary",
			discipline: null,
		});
		await insertDocument(db, {
			id: "skill-design",
			title: "design-skill",
			body: "Design skill body.",
			slot: "skill",
			discipline: "design",
		});
		await insertDocument(db, {
			id: "skill-builder",
			title: "builder-skill",
			body: "Builder skill body.",
			slot: "skill",
			discipline: "builder",
		});

		const designerBundle = await assembleSessionDocuments(db, {
			agentId: "agent-designer",
			taskDescription: "",
			agentDiscipline: "design",
		});
		const designerIds = new Set(designerBundle.map((i) => i.id));
		expect(designerIds.has("doc-design")).toBe(true);
		expect(designerIds.has("doc-untagged")).toBe(true);
		expect(designerIds.has("skill-design")).toBe(true);
		expect(designerIds.has("doc-builder")).toBe(false);
		expect(designerIds.has("skill-builder")).toBe(false);

		const builderBundle = await assembleSessionDocuments(db, {
			agentId: "agent-builder",
			taskDescription: "",
			agentDiscipline: "builder",
		});
		const builderIds = new Set(builderBundle.map((i) => i.id));
		expect(builderIds.has("doc-builder")).toBe(true);
		expect(builderIds.has("doc-untagged")).toBe(true);
		expect(builderIds.has("skill-builder")).toBe(true);
		expect(builderIds.has("doc-design")).toBe(false);
		expect(builderIds.has("skill-design")).toBe(false);
	});

	test("matches case-insensitively: 'Design' stored, 'design' on the agent", async ({ db }) => {
		await insertDocument(db, {
			id: "doc-cased",
			title: "Cased design practice",
			body: "Stored with a capital D.",
			slot: "ordinary",
			discipline: "Design",
		});

		const bundle = await assembleSessionDocuments(db, {
			agentId: generateId(),
			taskDescription: "",
			agentDiscipline: "design",
		});
		expect(bundle.some((i) => i.id === "doc-cased")).toBe(true);
	});

	test("an agent_file is exempt from the filter — a discipline on it means nothing", async ({
		db,
	}) => {
		const agentId = "agent-af-exempt";
		const now = new Date().toISOString();
		await db.insert(documents).values({
			id: "af-exempt",
			scopeKind: "user",
			scopeId: agentId,
			title: "Identity",
			body: "You are this agent.",
			format: "markdown",
			status: "active",
			slot: "agent_file",
			parentKind: "agent",
			parentId: agentId,
			discipline: null,
			version: 1,
			updatedBy: "test-user",
			createdAt: now,
			updatedAt: now,
		});

		const bundle = await assembleSessionDocuments(db, {
			agentId,
			taskDescription: "",
			agentDiscipline: "some-other-discipline",
		});
		expect(bundle.some((i) => i.id === "af-exempt")).toBe(true);
	});
});

describe("assembleSessionDocuments — discipline filter composes with tag-match ranking", () => {
	test("a perfect tag match from another discipline is never reintroduced by ranking", async ({
		db,
	}) => {
		await insertDocument(db, {
			id: "doc-qa-perfect-match",
			title: "authentication rollout runbook",
			body: "authentication rollout runbook for the QA team",
			slot: "ordinary",
			discipline: "qa",
		});

		const bundle = await assembleSessionDocuments(db, {
			agentId: "agent-design-compose",
			// Matches the QA doc's title/body word for word — top tag-match score
			// if the ranker ever saw it. It must never see it: the discipline
			// filter runs in the fetch, before ranking, so a high tag score
			// cannot pull an excluded discipline's document back in.
			taskDescription: "authentication rollout runbook",
			agentDiscipline: "design",
		});
		expect(bundle.some((i) => i.id === "doc-qa-perfect-match")).toBe(false);
	});
});
