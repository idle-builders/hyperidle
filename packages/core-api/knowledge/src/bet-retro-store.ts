/**
 * `POST /bets/:id/retro` (AC1/AC2) write-sequence support for
 * `packages/core-api/src/routes/bets.ts` — NOT the general CRUD surface
 * (see `knowledge-repository.ts`). Same idiom as `practice-meeting-store.ts`
 * (a per-consumer write sequence replicated verbatim so behavior stays
 * byte-identical — see that file's own top `@lore` for why `create()`/
 * `update()` weren't reused: the retro upsert's exact field set, conditional
 * insert-vs-update branch, and meta-merge-preserving-hypothesis-snapshot
 * logic isn't expressible through the general repository without changing
 * observable behavior).
 *
 * @lore AU19 Increment 5 item 4 (guard-retirement full-sweep, knowledge
 * sub-item): `routes/bets.ts`'s retro handler queried/wrote `knowledgeItems`/
 * `knowledgeAppProjection` (both `knowledge`-owned, `TABLE_OWNER` since
 * Increment 1a) directly inside its own `db.transaction` — legal while it
 * lived in the unguarded `packages/server` composition root, a Table ACL
 * violation now. Accepts `HyperIdleDb` (not a narrower `WriteExecutor`) —
 * same convention `knowledge-repository.ts`'s `flagItem` already
 * established for its own tx-participant caller (`routes/knowledge.ts`
 * casts `tx as HyperIdleDb`; `routes/bets.ts` does the same here).
 */
import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

export interface RetroExistingKnowledgeItemRow {
	readonly id: string;
	readonly version: number;
}

/**
 * Find the existing retro knowledge item for a bet: `scopeKind === "bet"`,
 * `scopeId === betId`, projection `kind === "reflection"` (upsert lookup,
 * read-only, called outside the write transaction — same as the original
 * inline query).
 */
export async function findRetroKnowledgeItemForBet(
	db: HyperIdleDb,
	betId: string,
): Promise<RetroExistingKnowledgeItemRow | null> {
	const [row] = await db
		.select({ id: knowledgeItems.id, version: knowledgeItems.version })
		.from(knowledgeItems)
		.innerJoin(
			knowledgeAppProjection,
			eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
		)
		.where(
			and(
				eq(knowledgeItems.scopeKind, "bet"),
				eq(knowledgeItems.scopeId, betId),
				eq(knowledgeAppProjection.kind, "reflection"),
			),
		)
		.limit(1);
	return row ?? null;
}

export interface UpsertBetRetroKnowledgeItemInput {
	readonly existing: RetroExistingKnowledgeItemRow | null;
	readonly retroKnowledgeItemId: string;
	readonly betId: string;
	readonly title: string;
	readonly body: string;
	readonly verdict: string;
	readonly hypothesisSnapshot: string;
	readonly actor: string | undefined;
	readonly timestamp: string;
}

/**
 * Upsert the bet retro knowledge item + projection row inside the caller's
 * transaction. Update branch: kernel row (title/body/version+1/updatedAt/
 * updatedBy) + projection `meta` merge (preserving the immutable hypothesis
 * snapshot, AC2-4). Insert branch: new kernel row (status "active",
 * version 1) + new projection row (`kind: "reflection"`, meta seeded with
 * `hypothesis`/`verdict`/`validatedAt`/`validatedBy`).
 */
export async function upsertBetRetroKnowledgeItem(
	db: HyperIdleDb,
	input: UpsertBetRetroKnowledgeItemInput,
): Promise<void> {
	const {
		existing,
		retroKnowledgeItemId,
		betId,
		title,
		body,
		verdict,
		hypothesisSnapshot,
		actor,
		timestamp,
	} = input;

	if (existing) {
		// Upsert: update existing knowledge item — version incremented, body updated
		await db
			.update(knowledgeItems)
			.set({
				title,
				body,
				version: existing.version + 1,
				updatedAt: timestamp,
				updatedBy: actor ?? "system",
			})
			.where(eq(knowledgeItems.id, existing.id));

		// Update projection meta (verdict changes; hypothesis snapshot stays from first write)
		const [existingFabric] = await db
			.select()
			.from(knowledgeAppProjection)
			.where(eq(knowledgeAppProjection.knowledgeItemId, existing.id))
			.limit(1);
		if (existingFabric) {
			const existingMeta = existingFabric.meta
				? (JSON.parse(existingFabric.meta) as Record<string, unknown>)
				: {};
			// AC2-4: hypothesis snapshot is immutable — preserve the original
			const updatedMeta = {
				...existingMeta,
				verdict,
				validatedAt: timestamp,
				validatedBy: actor ?? null,
			};
			await db
				.update(knowledgeAppProjection)
				.set({ meta: JSON.stringify(updatedMeta) })
				.where(eq(knowledgeAppProjection.knowledgeItemId, existing.id));
		}
		return;
	}

	// Insert: create new knowledge item + projection row
	await db.insert(knowledgeItems).values({
		id: retroKnowledgeItemId,
		scopeKind: "bet",
		scopeId: betId,
		topic: null,
		title,
		body,
		format: "markdown",
		status: "active",
		version: 1,
		updatedBy: actor ?? "system",
		createdAt: timestamp,
		updatedAt: timestamp,
	});

	const fabricMeta = {
		betId,
		hypothesis: hypothesisSnapshot,
		verdict,
		validatedAt: timestamp,
		validatedBy: actor ?? null,
	};

	await db.insert(knowledgeAppProjection).values({
		id: crypto.randomUUID(),
		knowledgeItemId: retroKnowledgeItemId,
		layer: null,
		kind: "reflection",
		meta: JSON.stringify(fabricMeta),
	});
}
