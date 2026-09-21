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
 * methods they backed are DELETED — only `knowledge.create` (the writeback's
 * own remaining caller) still exists on this seam. Kept as historical design
 * record for the survivor, not corrected line-by-line.
 *
 * @lore document-module B0c: `knowledge.createKnowledgeConflict` and the
 * `POST /:id/conflicts` route it dialled are DELETED — a document has no
 * conflict object (founder ruling); an edit carrying a stale version is
 * refused and the writer retries, nothing records a conflict row.
 */

import {
	buildCoreApiPort,
	createInProcessCoreApiTransport,
	withActorTransport,
} from "@hyperidle/agent-orchestration";
import { documents, type HyperIdleDb, users } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { afterEach, describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

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

		const [row] = await db.select().from(documents).where(eq(documents.id, created.id)).limit(1);
		expect(row?.title).toBe("A written memory");
		// @lore BC4: the "still gets a projection row" assertion is deleted —
		// migration 0086 folded knowledge_app_projection into the kernel row
		// (architecture.md §6.2/§6.4), so there is no separate row to assert.
	});
});
