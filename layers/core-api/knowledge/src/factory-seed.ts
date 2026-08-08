/**
 * AU29 §2.5.2 — the owner writer the core-api first-boot face needs for the
 * factory principle knowledge seed.
 *
 * Deliberately NOT `knowledge-repository.ts`'s `create()` — that writer also
 * inserts a `knowledgeEditLog` row, which would change first-boot state (the
 * control captured pre-move has no edit-log entry for `seed-ki-1`). A
 * dedicated writer with the verbatim insert pair (`knowledgeItems` +
 * `knowledgeAppProjection`, both `onConflictDoNothing`) is required instead.
 */

import { type HyperIdleDb, knowledgeAppProjection, knowledgeItems } from "@hyperidle/db";

/**
 * Insert the factory principle knowledge item + its app projection row,
 * idempotently. Verbatim values from `factory-bootstrap.ts`'s former
 * `seed-ki-1` / `seed-ksf-1` inserts.
 */
export async function ensureFactoryKnowledgeSeed(db: HyperIdleDb, now: string): Promise<void> {
	await db
		.insert(knowledgeItems)
		.values({
			id: "seed-ki-1",
			scopeKind: "factory",
			scopeId: null,
			title: "Boil the Lake",
			body: "Solve the full problem, not a subset.",
			format: "markdown",
			status: "active",
			version: 1,
			updatedBy: "seed-agent-cos",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing();

	await db
		.insert(knowledgeAppProjection)
		.values({
			id: "seed-ksf-1",
			knowledgeItemId: "seed-ki-1",
			layer: "L4",
			kind: "principle",
		})
		.onConflictDoNothing();
}
