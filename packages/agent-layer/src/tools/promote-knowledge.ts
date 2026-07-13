import { randomUUID } from "node:crypto";
import { knowledgeConflicts, knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import {
	KERNEL_KNOWLEDGE_STATUSES,
	type KernelKnowledgeStatus,
	KNOWLEDGE_STATUSES,
	type KnowledgeStatus,
} from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import z from "zod";
import type { ToolContext, ToolDefinition } from "./tool-registry.js";
import { err, ok, type ToolResult } from "./tool-result.js";

/**
 * A knowledge item's current DB status is either a fabric strategy status
 * (the 7-value promotion pipeline) or a kernel status ("draft", "active",
 * "archived" from KERNEL_KNOWLEDGE_STATUSES).
 *
 * @lore R7: write_memory creates items with status="draft" (a KernelKnowledgeStatus).
 * promote_knowledge must accept "draft" as a valid from-status so facilitators
 * can move triage items into the curated knowledge base.
 */
type AnyKnowledgeStatus = KnowledgeStatus | KernelKnowledgeStatus;

function isAnyKnowledgeStatus(value: string): value is AnyKnowledgeStatus {
	return (
		(KNOWLEDGE_STATUSES as readonly string[]).includes(value) ||
		(KERNEL_KNOWLEDGE_STATUSES as readonly string[]).includes(value)
	);
}

/**
 * `promote_knowledge` — transition a knowledge item's lifecycle status along
 * the promotion chain. G1 proves CAPTURED → PROVISIONAL end-to-end and
 * installs the CONFLICT_OPEN gate on the validated-transition (per
 * KNOWLEDGE_ARCHITECTURE §6.2). G3 will add auto-promotion routines and the
 * "5+ repetitions → VALIDATED" rule on top of this contract.
 *
 * @lore `needs_human` is a hold state — entered by the fabric when automated
 * resolution fails and exited only by an explicit human review (separate
 * API), not by this auto-promote tool. Keeping the outbound list empty
 * means an agent-driven promote call against a `needs_human` item returns
 * INVALID_TRANSITION rather than silently bypassing the human gate.
 *
 * @lore R7: "draft" is the triage entry point for agent-created knowledge
 * items (write_memory defaults to "draft"). A facilitator uses promote_knowledge
 * to move draft → active (bypassing the captured/provisional/validated pipeline
 * when the item is already reviewed and ready). Draft items may also be archived
 * directly (rejected during triage) or moved into the captured pipeline.
 */
const ALLOWED_TRANSITIONS: Record<AnyKnowledgeStatus, readonly AnyKnowledgeStatus[]> = {
	// Kernel triage statuses (R7)
	draft: ["active", "captured", "archived"],
	// Fabric promotion pipeline statuses
	captured: ["provisional"],
	provisional: ["validated", "archived", "needs_human"],
	validated: ["active", "archived"],
	active: ["stale", "archived"],
	stale: ["active", "archived"],
	archived: [],
	needs_human: [],
};

const promoteKnowledgeInputSchema = z.object({
	knowledgeItemId: z.string().min(1),
	toStatus: z.enum(KNOWLEDGE_STATUSES),
	// 64 KiB cap on free-text to prevent DoS via oversized prompts.
	reason: z.string().max(65_536).optional(),
});

type PromoteKnowledgeInput = z.infer<typeof promoteKnowledgeInputSchema>;

interface PromoteKnowledgeData {
	readonly knowledgeItemId: string;
	readonly fromStatus: string;
	readonly toStatus: string;
}

async function handler(
	input: PromoteKnowledgeInput,
	ctx: ToolContext,
): Promise<ToolResult<PromoteKnowledgeData>> {
	const { knowledgeItemId, toStatus, reason } = input;

	const [row] = await ctx.db
		.select()
		.from(knowledgeItems)
		.where(eq(knowledgeItems.id, knowledgeItemId))
		.limit(1);
	if (!row) {
		return err("NOT_FOUND", `Knowledge item not found: ${knowledgeItemId}`);
	}

	// Narrow rather than cast — a row with an unexpected status value points to
	// an upstream bug or schema drift, not a user input problem.
	// isAnyKnowledgeStatus accepts both fabric pipeline statuses AND kernel triage
	// statuses (e.g. "draft" from write_memory) — see R7 lore above.
	if (!isAnyKnowledgeStatus(row.status)) {
		return err("INVALID_STATE", `unknown current status: ${row.status}`);
	}
	const fromStatus: AnyKnowledgeStatus = row.status;

	const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
	if (!allowed.includes(toStatus)) {
		return err("INVALID_TRANSITION", `cannot transition ${fromStatus} → ${toStatus}`);
	}

	const now = new Date().toISOString();
	const editor = `agent:${ctx.agentId}`;

	// Wrap the gate-check + conditional UPDATE + edit-log INSERT in a
	// transaction. Under PGlite/Postgres this serializes concurrent promotes so
	// two callers racing from `provisional -> validated` cannot both succeed;
	// the loser sees 0 rows changed and returns CONCURRENT_MODIFICATION.
	const txResult = await ctx.db.transaction(
		async (tx): Promise<ToolResult<PromoteKnowledgeData>> => {
			// Conflict gate: block promotion to 'validated' while any open conflict
			// exists on the item (KNOWLEDGE_ARCHITECTURE §6.2). Inside the tx so the
			// gate read and the status update are atomic.
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
					return err("CONFLICT_OPEN", "open conflict blocks promotion to validated");
				}
			}

			// @lore: status changes do NOT bump `version` — version is reserved for
			// content edits, matching knowledge-repository.update conventions.
			//
			// Conditional UPDATE: WHERE clause pins `status = fromStatus` so a
			// racing caller that has already transitioned the row sees 0 changes
			// and we fail CONCURRENT_MODIFICATION instead of silently clobbering
			// their write.
			const updated = await tx
				.update(knowledgeItems)
				.set({ status: toStatus, updatedAt: now, updatedBy: editor })
				.where(and(eq(knowledgeItems.id, knowledgeItemId), eq(knowledgeItems.status, fromStatus)))
				.returning({ id: knowledgeItems.id });

			if (updated.length === 0) {
				return err(
					"CONCURRENT_MODIFICATION",
					`knowledge item ${knowledgeItemId} no longer in status ${fromStatus}`,
				);
			}

			// Persist the promotion reason (if any) alongside the transition in
			// the edit log so the audit trail is complete.
			const newValue = reason ? `${toStatus} | reason: ${reason}` : toStatus;
			await tx.insert(knowledgeEditLog).values({
				id: randomUUID(),
				itemId: knowledgeItemId,
				editor,
				field: "status",
				oldValue: fromStatus,
				newValue,
				editType: "refinement",
				createdAt: now,
			});

			return ok<PromoteKnowledgeData>({
				knowledgeItemId,
				fromStatus,
				toStatus,
			});
		},
	);

	return txResult;
}

export const promoteKnowledgeTool: ToolDefinition<PromoteKnowledgeInput> = {
	name: "promote_knowledge",
	description:
		"Transition a knowledge item's lifecycle status (captured → provisional → validated → active → stale → archived). Blocks promotion to 'validated' if any open conflict exists on the item.",
	inputSchema: promoteKnowledgeInputSchema,
	handler,
	// @lore AD8b: role string "chief_of_staff" renamed to "assistant".
	// @lore AD8c: role string "practice_facilitator" renamed to "facilitator".
	roles: ["assistant", "facilitator", "product_manager"],
};
