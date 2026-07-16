/**
 * `promote_knowledge` tool's atomic status-transition (AU19 Increment 4 —
 * `tools/promote-knowledge.ts` moves into the guarded `tool-handlers`
 * package, surfacing its direct `knowledgeItems`/`knowledgeConflicts`/
 * `knowledgeEditLog` transaction as a Table ACL violation for real). The
 * whole gate-check + conditional-UPDATE + edit-log-INSERT transaction is one
 * `knowledge`-owned function — behaviour byte-identical to the pre-migration
 * inline `ctx.db.transaction(...)` block.
 */
import * as crypto from "node:crypto";
import {
	type HyperIdleDb,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
} from "@hyperidle/db";
import { and, eq } from "drizzle-orm";

/** Read just the `status` column of a `knowledgeItems` row — the sole field `promote_knowledge` needs before choosing a transition. */
export async function findKnowledgeItemStatusById(
	db: HyperIdleDb,
	id: string,
): Promise<{ readonly status: string } | undefined> {
	const [row] = await db
		.select({ status: knowledgeItems.status })
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, id))
		.limit(1);
	return row;
}

export type PromoteKnowledgeItemResult =
	| { readonly ok: true; readonly fromStatus: string }
	| {
			readonly ok: false;
			readonly code: "CONFLICT_OPEN" | "CONCURRENT_MODIFICATION";
			readonly message: string;
	  };

export interface PromoteKnowledgeItemInput {
	readonly knowledgeItemId: string;
	readonly fromStatus: string;
	readonly toStatus: string;
	readonly reason: string | undefined;
	readonly editor: string;
}

export async function promoteKnowledgeItem(
	db: HyperIdleDb,
	input: PromoteKnowledgeItemInput,
): Promise<PromoteKnowledgeItemResult> {
	const { knowledgeItemId, fromStatus, toStatus, reason, editor } = input;
	const now = new Date().toISOString();

	return db.transaction(async (tx): Promise<PromoteKnowledgeItemResult> => {
		if (toStatus === "validated") {
			const [openConflict] = await tx
				.select()
				.from(knowledgeConflicts)
				.where(
					and(
						eq(knowledgeConflicts.itemId, knowledgeItemId),
						eq(knowledgeConflicts.status, "open"),
					),
				)
				.limit(1);
			if (openConflict) {
				return {
					ok: false,
					code: "CONFLICT_OPEN",
					message: "open conflict blocks promotion to validated",
				};
			}
		}

		const updated = await tx
			.update(knowledgeItems)
			.set({ status: toStatus, updatedAt: now, updatedBy: editor })
			.where(and(eq(knowledgeItems.id, knowledgeItemId), eq(knowledgeItems.status, fromStatus)))
			.returning({ id: knowledgeItems.id });

		if (updated.length === 0) {
			return {
				ok: false,
				code: "CONCURRENT_MODIFICATION",
				message: `knowledge item ${knowledgeItemId} no longer in status ${fromStatus}`,
			};
		}

		const newValue = reason ? `${toStatus} | reason: ${reason}` : toStatus;
		await tx.insert(knowledgeEditLog).values({
			id: crypto.randomUUID(),
			itemId: knowledgeItemId,
			editor,
			field: "status",
			oldValue: fromStatus,
			newValue,
			editType: "refinement",
			createdAt: now,
		});

		return { ok: true, fromStatus };
	});
}
