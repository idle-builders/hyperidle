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
 * Every method below does not exist yet on `CoreApiPort`/`buildCoreApiPort` —
 * `buildCoreApiPort`'s real returned object carries no `knowledge` property at
 * all today (only `work`/`users`/`conversation`/`org`/`routine`), so each test
 * fails at RUNTIME (`TypeError: Cannot read properties of undefined (reading
 * '<method>')`), not at import-resolution time — the composition function +
 * transport already exist from Increment 1/earlier Increment 2 waves. RED for
 * the right reason: missing implementation, not a typo.
 *
 * Backing-route plan (documented here for the GREEN-phase builder — verified
 * against real route source, `layers/core-api/src/routes/knowledge.ts`):
 *  - `knowledge.search` → REUSE existing `GET /knowledge/search?q=`, EXTENDED
 *    to accept an optional `limit` query param (today hardcoded to
 *    `search(db, query, {mode:"text"})`, silently ignoring any caller limit —
 *    `query_practice` needs `limit*5` so it can filter by layer client-side).
 *  - `knowledge.create` → REUSE existing `POST /knowledge`
 *    (`createKnowledgeSchema`), EXTENDED to accept an optional `kind` field
 *    and an optional explicit `layer` override. Today the route always
 *    computes `layer` via `scopeToLayer(scopeKind)` and never accepts `kind`
 *    at all (`createKnowledgeSchema` has no `kind` field) — `write_memory`'s
 *    real call passes BOTH an explicit `layer` (its own `KNOWLEDGE_LAYERS`
 *    enum, independent of `scopeToLayer`) and a `kind`
 *    (pattern/anti_pattern/decision/etc.) that the current schema silently
 *    drops. `CreateKnowledgeItemInput.kind` (`knowledge-repository.ts:56-60`)
 *    is documented as already supporting exactly this — "made optional so
 *    callers with no `kind` concept (the HTTP route) can omit it"; the seam
 *    caller (an agent tool) DOES have a `kind` concept, so the route must
 *    stop omitting it for this caller. Minimal schema widening, same idiom as
 *    `UpdateOrgTeamRequest` gaining `leadAgentId` / `HandoffTaskRequest`
 *    gaining `contextId`/`status`/`error` in earlier waves — not a new route.
 *  - `knowledge.findKnowledgeItemVersionById` → REUSE existing
 *    `GET /knowledge/:id` (`{view:"detail"}` response already spreads the raw
 *    item, which carries `version`); extract `{id, version}`. Same
 *    shape-tolerance precedent as `work.getBetById` reusing `GET /bets/:id`.
 *  - `knowledge.findKnowledgeItemStatusById` → REUSE the SAME
 *    `GET /knowledge/:id` route; extract `{status}`.
 *  - `knowledge.findOpenConflictByItemAndProposer` → NEW
 *    `GET /knowledge/:id/conflicts?proposedBy=` (no existing route resolves
 *    an open conflict by item+proposer — `findOpenConflict`,
 *    `knowledge-conflicts.ts:66`, has no HTTP door today).
 *  - `knowledge.createKnowledgeConflict` → NEW `POST /knowledge/:id/conflicts`
 *    (`recordConflict`, `knowledge-conflicts.ts:48`, has no HTTP door today —
 *    `create_conflict_review` calls the raw DI function directly).
 *  - `knowledge.promoteKnowledgeItem` → NEW `POST /knowledge/:id/promote`
 *    (`transition(db,id,{target:"promote",...})`,
 *    `knowledge-repository.ts:1240` — no HTTP route wraps the `"promote"`
 *    transition target today; the existing `/scope`/`/merge`/`/split`/
 *    `/archive`/`/flag` routes each wrap a DIFFERENT transition target).
 *    Response carries the full `PromoteTransitionResult` discriminated union
 *    (`{ok:true,fromStatus}` | `{ok:false,code,message}`) at HTTP 200 either
 *    way — the seam forwards the domain result as-is, same as
 *    `work.updateBetById`'s per-field PATCH forwards a domain error via
 *    `throwSeamError` only for a genuine transport/validation failure, not a
 *    domain-level "blocked" outcome.
 *  - `knowledge.upsertKnowledgeAppProjectionAttentionScore` → NEW
 *    `PATCH /knowledge/:id/attention-score`
 *    (`transition(db,id,{target:"recomputeAttention",attentionScore})`,
 *    `knowledge-repository.ts:1223` — no HTTP route wraps this transition
 *    target today either).
 *  - `knowledge.recomputeAttentionScoreForItem` → NEW
 *    `POST /knowledge/:id/recompute-attention`. Collapses
 *    `buildCreateReviewItemForKnowledge({conversation,work})` +
 *    `buildAttentionService({db,eventBus,work,review}).recomputeOne(id)` —
 *    see `tool-handlers/src/ports.ts`'s top `@lore` — the route lives in
 *    core-api, so it wires `@hyperidle/review`/`@hyperidle/work` directly
 *    (ordinary same-layer DI), same composition
 *    `tool-handlers-bindings.ts`'s own `recomputeAttentionScoreForItem`
 *    helper performs today, just moved behind a real HTTP door instead of a
 *    raw same-process DI call. The route's own `eventBus` is already wired
 *    (`createKnowledgeRoutes(db, eventBus)`) — the seam method takes no
 *    `eventBus` argument (dropped from the port signature vs. today's raw
 *    `ToolHandlersKnowledgeAccessor.recomputeAttentionScoreForItem(db,
 *    eventBus, knowledgeItemId)`; the seam never threads a same-process
 *    `EventBus` handle over an HTTP boundary).
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
import { describe, expect, test, vi } from "../../__testing__/test-fixtures.js";

const NOW = "2026-07-28T00:00:00.000Z";

interface SeamKnowledgeCreateInput {
	readonly layer: string | null;
	readonly scopeKind?: string | null;
	readonly scopeId?: string | null;
	readonly kind?: string | null;
	readonly topic?: string | null;
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

interface SeamPromoteResult {
	readonly ok: true;
	readonly fromStatus: string;
}

interface SeamPromoteConflictResult {
	readonly ok: false;
	readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
	readonly message: string;
}

interface SeamCoreApiPortIncrement2Knowledge {
	readonly knowledge: {
		search(
			query: string,
			opts: { readonly limit: number },
		): Promise<ReadonlyArray<Record<string, unknown> & { readonly layer?: string | null }>>;
		create(input: SeamKnowledgeCreateInput): Promise<SeamKnowledgeCreateResponse>;
		findKnowledgeItemVersionById(
			id: string,
		): Promise<{ readonly id: string; readonly version: number } | undefined>;
		findKnowledgeItemStatusById(id: string): Promise<{ readonly status: string } | undefined>;
		findOpenConflictByItemAndProposer(
			itemId: string,
			proposedBy: string,
		): Promise<{ readonly id: string } | undefined>;
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
		promoteKnowledgeItem(input: {
			readonly knowledgeItemId: string;
			readonly fromStatus: string;
			readonly toStatus: string;
			readonly reason: string | undefined;
			readonly editor: string;
		}): Promise<SeamPromoteResult | SeamPromoteConflictResult>;
		upsertKnowledgeAppProjectionAttentionScore(
			knowledgeItemId: string,
			attentionScore: string,
		): Promise<void>;
		recomputeAttentionScoreForItem(knowledgeItemId: string): Promise<{ readonly current: number }>;
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
		status: opts.status ?? "draft",
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

describe("CoreApiPort.knowledge.search — Increment 2 knowledge wave (RED)", () => {
	test("search reaches the real full-text-search route and respects the requested limit", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-search"));
		const agentId = ids("agent-know-search1");
		await seedAgent(db, agentId);
		const ki1 = ids("ki-search-1");
		const ki2 = ids("ki-search-2");
		const ki3 = ids("ki-search-3");
		await seedKnowledgeItem(db, { id: ki1, title: "Widget rollout pattern" });
		await seedKnowledgeItem(db, { id: ki2, title: "Widget onboarding pattern" });
		await seedKnowledgeItem(db, { id: ki3, title: "Widget deprecation pattern" });

		const port = buildSeamPort(agentId, app);
		const results = await port.knowledge.search("Widget", { limit: 2 });

		expect(results.length).toBeLessThanOrEqual(2);
		for (const item of results) {
			expect(String(item.title)).toContain("Widget");
		}
	});
});

describe("CoreApiPort.knowledge.create — Increment 2 knowledge wave (RED)", () => {
	test("create reaches the real POST /knowledge route with write_memory's full field fidelity (kind + explicit layer land)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-create"));
		const agentId = ids("agent-know-create1");
		await seedAgent(db, agentId);

		const port = buildSeamPort(agentId, app);
		const created = await port.knowledge.create({
			layer: "L3",
			kind: "pattern",
			title: "A written memory",
			body: "The body of the memory",
			topic: "onboarding",
			format: "markdown",
			status: "draft",
			scopeKind: "factory",
			scopeId: null,
			updatedBy: `agent:${agentId}`,
		});

		expect(created.version).toBe(1);

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, created.id))
			.limit(1);
		expect(row?.title).toBe("A written memory");

		// The explicit layer/kind write_memory sends must land in the projection —
		// NOT silently dropped the way today's createKnowledgeSchema drops `kind`
		// and recomputes `layer` from scopeKind instead of honoring the caller's.
		const [projection] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, created.id))
			.limit(1);
		expect(projection?.layer).toBe("L3");
		expect(projection?.kind).toBe("pattern");
	});
});

describe("CoreApiPort.knowledge item-read methods — Increment 2 knowledge wave (RED)", () => {
	test("findKnowledgeItemVersionById reaches the real item-detail route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-version"));
		const agentId = ids("agent-know-version1");
		await seedAgent(db, agentId);
		const kiId = ids("ki-version-1");
		await seedKnowledgeItem(db, { id: kiId, version: 3 });

		const port = buildSeamPort(agentId, app);
		const found = await port.knowledge.findKnowledgeItemVersionById(kiId);

		expect(found?.id).toBe(kiId);
		expect(found?.version).toBe(3);
	});

	test("findKnowledgeItemVersionById against a nonexistent item resolves undefined (no throw)", async ({
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-version-404"));
		const port = buildSeamPort(ids("agent-know-version-missing"), app);
		const found = await port.knowledge.findKnowledgeItemVersionById(ids("no-such-item"));
		expect(found).toBeUndefined();
	});

	test("findKnowledgeItemStatusById reaches the real item-detail route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-status"));
		const agentId = ids("agent-know-status1");
		await seedAgent(db, agentId);
		const kiId = ids("ki-status-1");
		await seedKnowledgeItem(db, { id: kiId, status: "provisional" });

		const port = buildSeamPort(agentId, app);
		const found = await port.knowledge.findKnowledgeItemStatusById(kiId);

		expect(found?.status).toBe("provisional");
	});
});

describe("CoreApiPort.knowledge conflict methods — Increment 2 knowledge wave (RED)", () => {
	test("findOpenConflictByItemAndProposer reaches the real conflict-lookup route", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-findconflict"));
		const agentId = ids("agent-know-conflict1");
		await seedAgent(db, agentId);
		const kiId = ids("ki-conflict-1");
		await seedKnowledgeItem(db, { id: kiId });
		const conflictId = ids("conflict-existing-1");
		await db.insert(knowledgeConflicts).values({
			id: conflictId,
			itemId: kiId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "proposed replacement text",
			proposedBy: `agent:${agentId}`,
			status: "open",
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		const found = await port.knowledge.findOpenConflictByItemAndProposer(kiId, `agent:${agentId}`);

		expect(found?.id).toBe(conflictId);
	});

	test("findOpenConflictByItemAndProposer resolves undefined when no open conflict exists for that proposer", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-findconflict-none"));
		const agentId = ids("agent-know-conflict2");
		await seedAgent(db, agentId);
		const kiId = ids("ki-conflict-2");
		await seedKnowledgeItem(db, { id: kiId });

		const port = buildSeamPort(agentId, app);
		const found = await port.knowledge.findOpenConflictByItemAndProposer(kiId, `agent:${agentId}`);

		expect(found).toBeUndefined();
	});

	test("createKnowledgeConflict reaches the real conflict-create route (a real row lands in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-createconflict"));
		const agentId = ids("agent-know-conflict3");
		await seedAgent(db, agentId);
		const kiId = ids("ki-conflict-3");
		await seedKnowledgeItem(db, { id: kiId, version: 2 });
		const conflictId = ids("conflict-created-1");

		const port = buildSeamPort(agentId, app);
		await port.knowledge.createKnowledgeConflict({
			id: conflictId,
			itemId: kiId,
			versionBase: 2,
			versionCurrent: 2,
			proposedBody: "a proposed edit",
			proposedMeta: null,
			proposedBy: `agent:${agentId}`,
			createdAt: NOW,
		});

		const [row] = await db
			.select()
			.from(knowledgeConflicts)
			.where(eq(knowledgeConflicts.id, conflictId))
			.limit(1);
		expect(row?.itemId).toBe(kiId);
		expect(row?.status).toBe("open");
		expect(row?.proposedBy).toBe(`agent:${agentId}`);
	});

	test("a conflict write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-noauth"));
		const kiId = ids("ki-conflict-noauth");
		await seedKnowledgeItem(db, { id: kiId });
		const conflictId = ids("conflict-noauth-1");

		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement2Knowledge;

		await expect(
			port.knowledge.createKnowledgeConflict({
				id: conflictId,
				itemId: kiId,
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

describe("CoreApiPort.knowledge.promoteKnowledgeItem — Increment 2 knowledge wave (RED)", () => {
	test("promoteKnowledgeItem reaches the real promote route (status transitions in the DB)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-promote"));
		const agentId = ids("agent-know-promote1");
		await seedAgent(db, agentId);
		const kiId = ids("ki-promote-1");
		await seedKnowledgeItem(db, { id: kiId, status: "provisional" });

		const port = buildSeamPort(agentId, app);
		const result = await port.knowledge.promoteKnowledgeItem({
			knowledgeItemId: kiId,
			fromStatus: "provisional",
			toStatus: "validated",
			reason: "reviewed and confirmed",
			editor: `agent:${agentId}`,
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.fromStatus).toBe("provisional");
		}

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, kiId))
			.limit(1);
		expect(row?.status).toBe("validated");
	});

	test("promoteKnowledgeItem to 'validated' with an open conflict returns the domain CONFLICT_OPEN result (no throw, no state change)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-promote-conflict"));
		const agentId = ids("agent-know-promote2");
		await seedAgent(db, agentId);
		const kiId = ids("ki-promote-2");
		await seedKnowledgeItem(db, { id: kiId, status: "provisional" });
		const conflictId = ids("conflict-blocking-1");
		await db.insert(knowledgeConflicts).values({
			id: conflictId,
			itemId: kiId,
			versionBase: 1,
			versionCurrent: 1,
			proposedBody: "blocking edit",
			proposedBy: "agent:some-other-agent",
			status: "open",
			createdAt: NOW,
		});

		const port = buildSeamPort(agentId, app);
		const result = await port.knowledge.promoteKnowledgeItem({
			knowledgeItemId: kiId,
			fromStatus: "provisional",
			toStatus: "validated",
			reason: undefined,
			editor: `agent:${agentId}`,
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe("CONFLICT_OPEN");
		}

		const [row] = await db
			.select()
			.from(knowledgeItems)
			.where(eq(knowledgeItems.id, kiId))
			.limit(1);
		expect(row?.status).toBe("provisional");
	});
});

describe("CoreApiPort.knowledge attention-score methods — Increment 2 knowledge wave (RED)", () => {
	test("upsertKnowledgeAppProjectionAttentionScore reaches the real attention-score route (projection row upserted)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-attention"));
		const agentId = ids("agent-know-attention1");
		await seedAgent(db, agentId);
		const kiId = ids("ki-attention-1");
		await seedKnowledgeItem(db, { id: kiId });

		const port = buildSeamPort(agentId, app);
		await port.knowledge.upsertKnowledgeAppProjectionAttentionScore(kiId, "0.75");

		const [row] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, kiId))
			.limit(1);
		expect(row?.attentionScore).toBe("0.75");
	});

	test("recomputeAttentionScoreForItem reaches the real recompute route and returns the recomputed score", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-recompute"));
		const agentId = ids("agent-know-recompute1");
		await seedAgent(db, agentId);
		const kiId = ids("ki-recompute-1");
		await seedKnowledgeItem(db, { id: kiId });

		const port = buildSeamPort(agentId, app);
		const result = await port.knowledge.recomputeAttentionScoreForItem(kiId);

		expect(typeof result.current).toBe("number");
	});

	test("an attention-score write with no credentials is rejected, not silently bypassed (auth/boundary middleware ran)", async ({
		db,
		app,
		ids,
	}) => {
		vi.stubEnv("HYPERIDLE_API_KEY", ids("inc2-knowledge-key-attention-noauth"));
		const kiId = ids("ki-attention-noauth");
		await seedKnowledgeItem(db, { id: kiId });

		const port = buildCoreApiPort(
			createInProcessCoreApiTransport(app),
		) as unknown as SeamCoreApiPortIncrement2Knowledge;

		await expect(
			port.knowledge.upsertKnowledgeAppProjectionAttentionScore(kiId, "0.9"),
		).rejects.toThrow();
	});
});
