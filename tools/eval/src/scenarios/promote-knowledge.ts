/**
 * X8: Promote knowledge scenarios (interaction 14).
 *
 * Tests the promote_knowledge tool: triage workflow, pipeline promotion, conflict gate,
 * and archival. Facilitator-only tool.
 */

import { knowledgeEditLog, knowledgeItems } from "@hyperidle/db";
import { and, eq } from "drizzle-orm";
import {
	judgeNoHarmfulActions,
	judgeSessionCompleted,
	judgeSessionNotesWritten,
} from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedConflict, seedKnowledge, seedMinimalWorld } from "../seeding.js";
import type {
	DimensionScore,
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// pk-draft-triage-pf-consulting
// ---------------------------------------------------------------------------

let pkDraftTriageItemId = "";

const pkDraftTriagePfConsulting: EvalScenario = {
	id: "pk-draft-triage-pf-consulting",
	description: "PF promotes a proposed knowledge item to active (triage bypass workflow)",
	feature: "promote_knowledge",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "facilitator", // @lore AD8c: renamed from practice_facilitator
			agentSystemPrompt: `You are a practice facilitator reviewing proposed knowledge items.
When a proposed item is ready for community use (well-written, accurate, actionable), promote it to "active".
Use promote_knowledge with toStatus="active" for items that pass your triage review.
Provide a reason that explains why the item is ready for community access.`,
			taskTitle: "Triage proposed knowledge items for consulting community",
			taskDescription: `Review proposed knowledge items and promote those that meet quality standards.

There is a proposed item about consulting engagement patterns that is well-written and ready for community use.
Review it and promote it to "active" status using promote_knowledge:
- knowledgeItemId: the ID of the proposed item (in your context)
- toStatus: "active"
- reason: explain why this item is ready for community access

The draft covers: stakeholder alignment techniques for consulting engagements.
It meets quality standards: specific, actionable, and tested in practice.

After promoting, document your triage decision in session notes.`,
			betDescription: "Consulting knowledge curation",
			betDoneCondition: "Quality draft items promoted to active status.",
		});

		// Seed a draft knowledge item to promote
		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "factory",
			title: "Stakeholder Alignment Techniques",
			body: `# Stakeholder Alignment Techniques
- Start with individual interviews before group sessions to surface private concerns
- Use silent brainstorming before open discussion to prevent anchoring
- Establish explicit decision criteria before evaluating options
- Document agreements in writing during the meeting, not after`,
			updatedBy: `user:${world.founderId}`,
			status: "proposed",
		});
		pkDraftTriageItemId = knowledgeItemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				sandboxBasePath: ctx.seedResult.sandboxBasePath,
			},
			{
				taskId: ctx.seedResult.taskId,
				agentId: ctx.seedResult.agentId,
				teamId: ctx.seedResult.teamId,
			},
		);
	},
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeSessionNotesWritten(),
			{
				id: "promotion_correct",
				label: "Item Promoted to Active",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ status: knowledgeItems.status })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.id, pkDraftTriageItemId))
						.limit(1);
					const promoted = item?.status === "active";
					return {
						score: promoted ? 1.0 : 0.0,
						note: promoted ? undefined : `Status: ${item?.status ?? "not found"} (expected active)`,
					};
				},
			},
			{
				id: "edit_log_created",
				label: "Promotion Logged in Edit Log",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const logEntries = await ctx.db
						.select({ id: knowledgeEditLog.id, field: knowledgeEditLog.field })
						.from(knowledgeEditLog)
						.where(
							and(
								eq(knowledgeEditLog.itemId, pkDraftTriageItemId),
								eq(knowledgeEditLog.field, "status"),
							),
						);
					const hasLog = logEntries.length > 0;
					return {
						score: hasLog ? 1.0 : 0.0,
						note: hasLog ? undefined : "No edit log entry found for status change",
					};
				},
			},
		],
	},
};

// @lore nested-knowledge-items: `pk-pipeline-pf-devops` (captured -> provisional,
// an intermediate pipeline stage) is DELETED — the status ladder collapsed to
// proposed | active | stale | archived (plan.md "one lifecycle, no
// gatekeeping"), so there is no honest intermediate stage left to promote
// through; `pk-draft-triage-pf-consulting` above already covers the sole
// surviving early transition (proposed -> active).

// ---------------------------------------------------------------------------
// pk-conflict-blocked-pm-healthcare
// ---------------------------------------------------------------------------

let pkConflictBlockedItemId = "";

const pkConflictBlockedPmHealthcare: EvalScenario = {
	id: "pk-conflict-blocked-pm-healthcare",
	description: "PM attempts to promote to active but conflict gate blocks it",
	feature: "promote_knowledge",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager reviewing healthcare knowledge.
When you try to promote a knowledge item to "active" and get a CONFLICT_OPEN error,
it means an unresolved conflict exists on the item.
Note this in session notes and do NOT retry the promotion.
Document: what you tried to do, what error you received, and what needs to happen before promotion can succeed.`,
			taskTitle: "Validate healthcare protocol knowledge for regulatory approval",
			taskDescription: `Attempt to promote a proposed healthcare knowledge item to active status.

There is a proposed item about medication dosage protocols.
Try to promote it to "active" using promote_knowledge:
- knowledgeItemId: the ID of the proposed item
- toStatus: "active"

You will receive a CONFLICT_OPEN error because there is an open conflict on this item.
When this happens:
1. Note the error in session notes
2. Document that the conflict must be resolved before validation can proceed
3. Do NOT create additional knowledge items or conflicts`,
			betDescription: "Healthcare protocol knowledge validation",
			betDoneCondition: "Validation process documented with conflict resolution requirements.",
		});

		// Seed a provisional item
		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "factory",
			title: "Medication Dosage Protocol for Pediatric Patients",
			body: "Pediatric dosing: weight-based calculations required. Standard adult doses are NOT appropriate.",
			updatedBy: `user:${world.founderId}`,
			status: "proposed",
		});
		pkConflictBlockedItemId = knowledgeItemId;

		// Seed an open conflict that will block the promotion
		await seedConflict(ctx.db, {
			itemId: knowledgeItemId,
			proposedBy: `user:${world.founderId}`,
			proposedBody:
				"Pediatric dosing requires pharmacy consultation for all medications, not just weight-based calculation.",
			versionBase: 0,
			versionCurrent: 0,
			status: "open",
		});

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				sandboxBasePath: ctx.seedResult.sandboxBasePath,
			},
			{
				taskId: ctx.seedResult.taskId,
				agentId: ctx.seedResult.agentId,
				teamId: ctx.seedResult.teamId,
			},
		);
	},
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeNoHarmfulActions(),
			{
				id: "conflict_gate_respected",
				label: "Conflict Gate Respected (Item Not Activated)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ status: knowledgeItems.status })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.id, pkConflictBlockedItemId))
						.limit(1);
					const blocked = item?.status !== "active";
					return {
						score: blocked ? 1.0 : 0.0,
						note: blocked
							? `Item correctly remains in ${item?.status} status`
							: "Item was incorrectly promoted to active despite open conflict",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// pk-archive-cos-marketing
// ---------------------------------------------------------------------------

let pkArchiveItemId = "";

const pkArchiveCosMarketing: EvalScenario = {
	id: "pk-archive-cos-marketing",
	description: "System agent archives stale marketing knowledge with reason",
	feature: "promote_knowledge",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "assistant",
			agentSystemPrompt: `You are a system agent responsible for knowledge quality.
When you identify stale or outdated knowledge that is no longer relevant, archive it.
Use promote_knowledge with toStatus="archived" and provide a reason explaining why the item is outdated.
Archiving keeps the knowledge base clean without permanently deleting history.`,
			taskTitle: "Archive outdated marketing knowledge items",
			taskDescription: `Review the marketing knowledge base and archive outdated items.

There is a stale item about social media strategies from 2021 that refers to platforms and features that no longer exist.
Archive it using promote_knowledge:
- knowledgeItemId: the ID of the stale item
- toStatus: "archived"
- reason: explain why the item is outdated (platform changes, feature deprecation, etc.)

Document your archival decision in session notes.`,
			betDescription: "Marketing knowledge base cleanup",
			betDoneCondition: "Outdated marketing knowledge archived.",
		});

		// Seed a stale item
		const { knowledgeItemId } = await seedKnowledge(ctx.db, {
			scopeKind: "factory",
			title: "2021 Social Media Strategy: Instagram Reels vs TikTok",
			body: "Use Instagram Reels when targeting users who don't use TikTok. Note: Clubhouse is emerging as a strong B2B platform.",
			updatedBy: `user:${world.founderId}`,
			status: "stale",
		});
		pkArchiveItemId = knowledgeItemId;

		return world;
	},
	trigger: async (ctx: TriggerContext): Promise<TriggerResult> => {
		return await runEvalSession(
			{
				db: ctx.db,
				eventBus: ctx.eventBus,
				sandboxBasePath: ctx.seedResult.sandboxBasePath,
			},
			{
				taskId: ctx.seedResult.taskId,
				agentId: ctx.seedResult.agentId,
				teamId: ctx.seedResult.teamId,
			},
		);
	},
	rubric: {
		dimensions: [
			judgeSessionCompleted(),
			judgeSessionNotesWritten(),
			{
				id: "promotion_correct",
				label: "Item Archived",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ status: knowledgeItems.status })
						.from(knowledgeItems)
						.where(eq(knowledgeItems.id, pkArchiveItemId))
						.limit(1);
					const archived = item?.status === "archived";
					return {
						score: archived ? 1.0 : 0.0,
						note: archived
							? undefined
							: `Status: ${item?.status ?? "not found"} (expected archived)`,
					};
				},
			},
			{
				id: "reason_present",
				label: "Archival Reason Documented",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check edit log for a reason
					const logEntry = await ctx.db
						.select({ newValue: knowledgeEditLog.newValue })
						.from(knowledgeEditLog)
						.where(
							and(
								eq(knowledgeEditLog.itemId, pkArchiveItemId),
								eq(knowledgeEditLog.field, "status"),
							),
						)
						.limit(1);

					const firstLogEntry = logEntry[0];
					if (!firstLogEntry) {
						return { score: 0.0, note: "No edit log entry" };
					}

					const hasReason = (firstLogEntry.newValue ?? "").includes("reason:");
					return {
						score: hasReason ? 1.0 : 0.5,
						note: hasReason ? undefined : "Status logged but no reason provided",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const promoteKnowledgeScenarios: EvalScenario[] = [
	pkDraftTriagePfConsulting,
	pkConflictBlockedPmHealthcare,
	pkArchiveCosMarketing,
];
