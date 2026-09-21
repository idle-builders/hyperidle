/**
 * AU21 §9 Increment 2 (knowledge wave) — RED phase.
 *
 * Extends the §11 contract-test harness to the last `tool-handlers`
 * capability family named in this wave's scope (`edge-disposition.md`'s
 * `knowledge.{get, create, transition, findOpenConflict, recordConflict}`
 * row, `§4 seam`) — `ToolHandlersKnowledgeAccessor`
 * (`tool-handlers/src/ports.ts:165-231`): `search`, `create`,
 * `findKnowledgeItemVersionById`, `findKnowledgeItemStatusById`,
 * `findOpenConflictByItemAndProposer`, `createKnowledgeConflict`,
 * `promoteKnowledgeItem`, `upsertKnowledgeAppProjectionAttentionScore`,
 * `recomputeAttentionScoreForItem`. Real call sites (verified from source,
 * `tool-definitions.ts`): `query_practice` (search), `write_memory` (create),
 * `score_attention` (findKnowledgeItemVersionById +
 * upsertKnowledgeAppProjectionAttentionScore + recomputeAttentionScoreForItem),
 * `promote_knowledge` (findKnowledgeItemStatusById + promoteKnowledgeItem),
 * `create_conflict_review` (findKnowledgeItemVersionById +
 * findOpenConflictByItemAndProposer + createKnowledgeConflict).
 *
 * @lore the six document tools (`write_memory`/`create_artifact`/
 * `promote_knowledge`/`create_conflict_review`/`merge_knowledge`/
 * `split_knowledge`) and the `search`/`findKnowledgeItemVersionById`/
 * `findKnowledgeItemStatusById`/`findOpenConflictByItemAndProposer`/
 * `promoteKnowledgeItem`/`mergeKnowledgeItem`/`splitKnowledgeItem` seam
 * methods they backed are DELETED — only `knowledge.create` and
 * `knowledge.createKnowledgeConflict` (the writeback's own remaining
 * callers) still exist on this seam. Kept as historical design record for
 * the survivors, not corrected line-by-line.
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import {
	type HyperIdleDb,
	knowledgeAppProjection,
	knowledgeConflicts,
	knowledgeItems,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import {
	afterEach,
	describe,
	expect,
	test,
	vi,
	withoutServiceTestAuth,
} from "../../__testing__/test-fixtures.js";

afterEach(() => vi.unstubAllEnvs());

const NOW = "2026-07-28T00:00:00.000Z";

interface SeamKnowledgeCreateInput {
	readonly scopeKind?: string | null;
	readonly scopeId?: string | null;
	readonly title: string;
	readonly body: string;
	readonly format: string;
	readonly status: string;
	readonly updatedBy: string;
}

interface SeamKnowledgeCreateResponse {
	readonly id: string;
	readonly version: number;
}

interface SeamCoreApiPortIncrement2Knowledge {
	readonly knowledge: {
		create(input: SeamKnowledgeCreateInput): Promise<SeamKnowledgeCreateResponse>;
		createKnowledgeConflict(input: {
			readonly id: string;
			readonly itemId: string;
			readonly versionBase: number;
			readonly versionCurrent: number;
			readonly proposedBody: string;
			readonly proposedMeta: string | null;
			readonly proposedBy: string;
			readonly createdAt: string;
		}): Promise<void>;
	};
}

function buildSeamPort(actorId: string, app: Hono): SeamCoreApiPortIncrement2Knowledge {
	const transport = withActorTransport(createInProcessCoreApiTransport(app), { userId: actorId });
	return buildCoreApiPort(transport) as unknown as SeamCoreApiPortIncrement2Knowledge;
}

async function seedAgent(db: HyperIdleDb, id: string): Promise<void> {
	await db.insert(users).values({
		id,
		kind: "ai",
		name: `Agent ${id}`,
		role: "engineer",
		status: "active",
		createdAt: NOW,
	});
}

async function seedKnowledgeItem(
	db: HyperIdleDb,
	opts: {
		readonly id: string;
		readonly status?: string;
		readonly version?: number;
		readonly title?: string;
		readonly body?: string;
		readonly updatedBy?: string;
	},
): Promise<void> {
	await db.insert(knowledgeItems).values({
		id: opts.id,
		title: opts.title ?? "Seeded knowledge item",
		body: opts.body ?? "Seeded body content",
		format: "markdown",
		status: opts.status ?? "proposed",
		version: opts.version ?? 1,
		updatedBy: opts.updatedBy ?? "human:founder",
		createdAt: NOW,
		updatedAt: NOW,
	});
	// The owner writes the projection row alongside the item.
	await db
		.insert(knowledgeAppProjection)
		.values({ id: `${opts.id}-projection`, knowledgeItemId: opts.id });
}

describe("CoreApiPort.knowledge.create — Increment 2 knowledge wave (RED)", () => {
	test("create reaches the real POST /knowledge route with write_memory's full field fidelity (kind + explicit layer land)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-knowledge-key-create");
		await seedAgent(db, "agent-know-create1");

		const port = buildSeamPort("agent-know-create1", app);
		const created = await port.knowledge.create({
			title: "A written memory",
			body: "The body of the memory",
			format: "markdown",
			status: "proposed",
			scopeKind: "factory",
			scopeId: null,
			updatedBy: "agent:agent-know-create1",
		});

		expect(created.version).toBe(1);

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);
		expect(row?.title).toBe("A written memory");

		// @lore nested-knowledge-items: layer/kind are deleted vocabulary — a
		// created item still gets a projection row (kernel + projection always
		// write together), just without those two retired columns.
		const [projection] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, created.id))
			.limit(1);
		expect(projection).toBeDefined();
	});
});

describe("CoreApiPort.knowledge.createKnowledgeConflict — Increment 2 knowledge wave (RED)", () => {
	test("createKnowledgeConflict reaches the real conflict-create route (a real row lands in the DB)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-knowledge-key-createconflict");
		await seedAgent(db, "agent-know-conflict3");
		await seedKnowledgeItem(db, { id: "ki-conflict-3", version: 2 });

		const port = buildSeamPort("agent-know-conflict3", app);
		await port.knowledge.createKnowledgeConflict({
			id: "conflict-created-1",
			itemId: "ki-conflict-3",
			versionBase: 2,
			versionCurrent: 2,
			proposedBody: "a proposed edit",
			proposedMeta: null,
			proposedBy: "agent:agent-know-conflict3",
			createdAt: NOW,
		});

		const [row] = await db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.id, "conflict-created-1"))
			.limit(1);
		expect(row?.itemId).toBe("ki-conflict-3");
		expect(row?.status).toBe("open");
		expect(row?.proposedBy).toBe("agent:agent-know-conflict3");
	});

	test("a conflict write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", "inc2-knowledge-key-noauth");
		await seedKnowledgeItem(db, { id: "ki-conflict-noauth" });

		const port = buildCoreApiPort(
			withoutServiceTestAuth(createInProcessCoreApiTransport(app)),
		) as unknown as SeamCoreApiPortIncrement2Knowledge;

		await expect(
			port.knowledge.createKnowledgeConflict({
				id: "conflict-noauth-1",
				itemId: "ki-conflict-noauth",
				versionBase: 1,
				versionCurrent: 1,
				proposedBody: "should never land",
				proposedMeta: null,
				proposedBy: "agent:nobody",
				createdAt: NOW,
			}),
		).rejects.toThrow();
	});
});
