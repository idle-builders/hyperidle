/**
 * X8: Read document scenarios (interaction 21 — B35 new).
 *
 * Tests `search_documents`/`open_document`: the read side of the document
 * module, which did not exist before (an agent could only write —
 * `write_memory`/`create_artifact` — never search or open a document it did
 * not already know the id of).
 *
 * @lore BC4 §6.7: `open_document` raises `readCount`; `search_documents` does
 * not. Seeding one relevant document and one distractor, and asserting the
 * relevant document's `readCount` rose while the distractor's did not, is
 * the honest way to prove `open_document` — not just `search_documents` —
 * was actually called, without reaching into tool-call events.
 */

import { documents, sessions } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSessionCompleted, judgeSessionNotesWritten } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedDocument, seedMinimalWorld } from "../seeding.js";
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
// rd-find-and-open-builder-devops
// ---------------------------------------------------------------------------

let rdRelevantDocumentId = "";
let rdDistractorDocumentId = "";

const rdFindAndOpenBuilderDevops: EvalScenario = {
	id: "rd-find-and-open-builder-devops",
	description: "Builder searches for a document, opens it, and uses its content",
	feature: "read_document",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on DevOps infrastructure.
Before starting, use search_documents to find any existing document about the deploy runbook,
then use open_document to read it in full. Follow what it says.`,
			taskTitle: "Follow the existing deploy runbook to roll out the new release",
			taskDescription: `A runbook document already exists that describes the deploy steps.

Find it with search_documents (try a query like "deploy runbook"), then open it with
open_document to read the full steps. Write session notes that restate the specific
rollback threshold the runbook names — do not invent one.`,
			betDescription: "Release rollout following the existing runbook",
			betDoneCondition: "Release rolled out following the documented runbook.",
		});

		const { documentId: relevantId } = await seedDocument(ctx.db, {
			scopeKind: "team",
			scopeId: world.teamId,
			title: "Deploy Runbook: Production Release Steps",
			body: "1. Run the smoke tests. 2. Deploy to 10% of traffic. 3. Watch error rate for 15 minutes. 4. If error rate exceeds 2%, roll back immediately. 5. Otherwise, deploy to 100%.",
			updatedBy: `user:${world.founderId}`,
		});
		rdRelevantDocumentId = relevantId;

		// A distractor the agent should not need to open — proves the read-count
		// assertion below is checking the RIGHT document, not just "something".
		const { documentId: distractorId } = await seedDocument(ctx.db, {
			scopeKind: "team",
			scopeId: world.teamId,
			title: "Brand Voice Guidelines",
			body: "Plain words over jargon. Warm but never cute. Every claim carries a number or is cut.",
			updatedBy: `user:${world.founderId}`,
		});
		rdDistractorDocumentId = distractorId;

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
				id: "document_opened",
				label: "Relevant Document Opened (readCount rose, distractor untouched)",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [relevant] = await ctx.db
						.select({ readCount: documents.readCount })
						.from(documents)
						.where(eq(documents.id, rdRelevantDocumentId))
						.limit(1);
					const [distractor] = await ctx.db
						.select({ readCount: documents.readCount })
						.from(documents)
						.where(eq(documents.id, rdDistractorDocumentId))
						.limit(1);

					if (!relevant) return { score: 0.0, note: "Seeded runbook document not found" };

					const relevantOpened = relevant.readCount > 0;
					const distractorLeftAlone = (distractor?.readCount ?? 0) === 0;

					if (relevantOpened && distractorLeftAlone) {
						return { score: 1.0 };
					}
					if (relevantOpened) {
						return {
							score: 0.5,
							note: "Runbook opened, but the distractor's readCount also rose",
						};
					}
					return {
						score: 0.0,
						note: `open_document not called on the runbook (readCount=${relevant.readCount})`,
					};
				},
			},
			judgeLlmQuality({
				id: "content_used",
				label: "Session Notes Restate the Runbook's Real Rollback Threshold",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const [session] = await ctx.db
						.select({ notes: sessions.notes })
						.from(sessions)
						.where(eq(sessions.id, ctx.triggerResult.sessionId))
						.limit(1);
					return session?.notes ?? "";
				},
				criteria: `Score 1.0 if session notes name the 2% error-rate rollback threshold from the runbook. Score 0.5 if notes mention rollback or error-rate monitoring without the specific number. Score 0.0 if the threshold is absent or fabricated (any number other than 2%).`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const readDocumentScenarios: EvalScenario[] = [rdFindAndOpenBuilderDevops];
