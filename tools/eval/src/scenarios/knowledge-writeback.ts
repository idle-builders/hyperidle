/**
 * X8: Knowledge writeback scenarios (interaction 20).
 *
 * Tests the file watcher writeback: new file creation, existing file edit, zone boundary.
 * Agents write files to the workspace; the watcher syncs them back to the DB.
 */

import { documents } from "@hyperidle/db";
import { and, eq, gt } from "drizzle-orm";
import {
	judgeNoHarmfulActions,
	judgeSessionCompleted,
	judgeSessionNotesWritten,
} from "../judges.js";
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
// kw-file-write-builder-devops
// ---------------------------------------------------------------------------

const kwFileWriteBuilderDevops: EvalScenario = {
	id: "kw-file-write-builder-devops",
	description: "Builder writes markdown to knowledge/ zone; watcher syncs it to DB",
	feature: "knowledge_writeback",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on DevOps infrastructure.
When you discover architectural decisions or patterns worth preserving, write them to the knowledge directory.
Create files in the knowledge/ zone of your workspace (e.g., knowledge/decisions/infrastructure-choice.md).
These files are automatically synced to the team's documents.`,
			taskTitle: "Document infrastructure decision for container orchestration",
			taskDescription: `Document the container orchestration technology decision for the team's documents.

The decision: After evaluating Kubernetes vs. AWS ECS, we chose Kubernetes for its portability.

Write this decision to your knowledge directory:
- File path: knowledge/decisions/container-orchestration.md
- Include: the decision, the alternatives considered, the reasoning
- Use markdown format with a clear header

This file will be automatically synced to the team's documents.
Also document what you wrote in session notes.`,
			betDescription: "Infrastructure architecture documentation",
			betDoneCondition: "Container orchestration decision documented as a document.",
		});
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
				id: "knowledge_file_written",
				label: "Document Synced to DB From File",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// The watcher creates items with updatedBy = "watcher" or similar
					// Check if a document was created after session started
					const newItems = await ctx.db
						.select({ id: documents.id, title: documents.title })
						.from(documents)
						.where(gt(documents.version, -1)); // all items

					// Items seeded before session have version 0; the session itself
					// doesn't create documents unless edit_document or watcher fires
					// We check total count > 0 seeded + some new items written by the agent
					if (newItems.length === 0) {
						return { score: 0.0, note: "No documents in DB" };
					}

					// Look for items that mention container orchestration or kubernetes
					const containerItems = newItems.filter((i: { id: string; title: string }) => {
						const title = (i.title ?? "").toLowerCase();
						return (
							title.includes("container") ||
							title.includes("kubernetes") ||
							title.includes("orchestration") ||
							title.includes("decision")
						);
					});

					if (containerItems.length > 0) {
						return {
							score: 1.0,
							note: `Document synced: ${containerItems[0]?.title ?? "unknown"}`,
						};
					}

					// Agent may have used edit_document (as:"memory") instead — partial credit
					const agentWrittenItems = await ctx.db
						.select({ id: documents.id })
						.from(documents)
						.where(eq(documents.updatedBy, ctx.seedResult.agentId));

					if (agentWrittenItems.length > 0) {
						return {
							score: 0.75,
							note: "Document written via edit_document tool (not file writeback)",
						};
					}

					return { score: 0.0, note: "No document synced to DB" };
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// kw-edit-existing-builder-frontend
// ---------------------------------------------------------------------------

let kwEditExistingItemId = "";

const kwEditExistingBuilderFrontend: EvalScenario = {
	id: "kw-edit-existing-builder-frontend",
	description: "Builder edits assembled document file; watcher updates the DB item",
	feature: "knowledge_writeback",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on frontend component patterns.
When an existing document needs updating, you can edit knowledge files directly in the knowledge/ directory.
The watcher automatically syncs your edits back to the team's documents.
Look for existing knowledge files in your workspace and update them when you find outdated information.`,
			taskTitle: "Update component accessibility pattern documentation",
			taskDescription: `Update the existing accessibility pattern documentation in the team's documents.

You will find an existing knowledge file in your workspace at:
knowledge/patterns/accessibility-modal.md

The current content describes focus trapping without mentioning the inert attribute.
Update it to add the modern inert attribute approach as an alternative.

Edit the file to add: "Modern alternative: use the inert attribute on background elements for simpler focus management."

Document your edit in session notes.`,
			betDescription: "Frontend accessibility pattern maintenance",
			betDoneCondition: "Accessibility patterns updated with modern techniques.",
		});

		// Seed a document that will be assembled into the workspace
		const { documentId } = await seedDocument(ctx.db, {
			scopeKind: "team",
			scopeId: world.teamId,
			title: "Accessibility Pattern: Modal Focus Trapping",
			body: "# Modal Focus Trapping\nUse JavaScript to trap focus within open modals. Listen for Tab and Shift+Tab keydown events and cycle through focusable elements.",
			updatedBy: `user:${world.founderId}`,
		});
		kwEditExistingItemId = documentId;

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
				id: "db_item_updated",
				label: "Document Updated in DB",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					const [item] = await ctx.db
						.select({ body: documents.body, version: documents.version })
						.from(documents)
						.where(eq(documents.id, kwEditExistingItemId))
						.limit(1);

					if (!item) {
						return { score: 0.0, note: "Document not found" };
					}

					// Check if the item was updated (version > 0 means content changed)
					const body = (item.body ?? "").toLowerCase();
					const mentionsInert = body.includes("inert");
					const mentionsModern = body.includes("modern") || body.includes("alternative");

					if (mentionsInert) {
						return { score: 1.0, note: "DB item updated with inert attribute content" };
					}
					if (mentionsModern) {
						return { score: 0.75, note: "DB item updated with modern alternative mention" };
					}
					if (item.version > 0) {
						return {
							score: 0.5,
							note: "DB item version bumped (content changed, but inert not found)",
						};
					}

					return { score: 0.0, note: "DB item not updated (version=0, content unchanged)" };
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// kw-ignored-zone-builder-consulting
// ---------------------------------------------------------------------------

const kwIgnoredZoneBuilderConsulting: EvalScenario = {
	id: "kw-ignored-zone-builder-consulting",
	description: "Builder writes to work/ zone (not knowledge/); watcher correctly ignores it",
	feature: "knowledge_writeback",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on a consulting deliverable.
Create a draft document in the work/ zone of your workspace for a work-in-progress document.
The work/ zone is for temporary work files — NOT for documents.
Only the knowledge/ zone is synced to the team's documents.
Write your draft to work/drafts/deliverable-outline.md and document this in session notes.`,
			taskTitle: "Draft consulting deliverable outline",
			taskDescription: `Create a draft outline for the client deliverable in your work directory.

Write the outline to: work/drafts/deliverable-outline.md

Content to include:
- Executive Summary placeholder
- Findings section (3 bullet points)
- Recommendations section

This is a working draft, NOT a document.
Do NOT write to the knowledge/ directory.
Document what you created in session notes.`,
			betDescription: "Client consulting deliverable",
			betDoneCondition: "Deliverable outline drafted.",
		});
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
				id: "no_unwanted_sync",
				label: "Work Files Not Synced to Documents",
				judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
					// Check that no new documents were created by the agent
					// (Watcher should ignore work/ zone)
					const agentWrittenDocuments = await ctx.db
						.select({ id: documents.id, title: documents.title })
						.from(documents)
						.where(and(eq(documents.updatedBy, ctx.seedResult.agentId)));

					if (agentWrittenDocuments.length === 0) {
						return {
							score: 1.0,
							note: "No documents created by agent (work/ zone correctly ignored)",
						};
					}

					// Check if the items are about deliverable/consulting (would indicate wrong zone)
					const workItems = agentWrittenDocuments.filter((i: { id: string; title: string }) => {
						const title = (i.title ?? "").toLowerCase();
						return (
							title.includes("deliverable") || title.includes("outline") || title.includes("draft")
						);
					});

					if (workItems.length > 0) {
						return {
							score: 0.0,
							note: `${workItems.length} work-zone items incorrectly synced to documents`,
						};
					}

					return {
						score: 0.5,
						note: `Agent wrote ${agentWrittenDocuments.length} documents (may be intentional edit_document usage)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const knowledgeWritebackScenarios: EvalScenario[] = [
	kwFileWriteBuilderDevops,
	kwEditExistingBuilderFrontend,
	kwIgnoredZoneBuilderConsulting,
];
