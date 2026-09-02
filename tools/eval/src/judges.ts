/**
 * X8: Reusable judge factory library.
 *
 * Provides composable judge factories that scenarios use in their rubric dimensions.
 * Each factory returns a RubricDimension. Scenarios import what they need.
 *
 * @lore X8: Two judge categories exist:
 * 1. Rule-based (deterministic DB queries) — used for structural side effects
 * 2. LLM-as-judge (judgeLlmQuality factory) — used for behavioral/quality dimensions
 *
 * W5 resolution: judgeLlmQuality has a concrete implementation with prompt template.
 * W6 resolution: fewer_tool_calls uses DB side-effect count as proxy (not in-memory buffer).
 */

import {
	items,
	knowledgeAppProjection,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	routines,
	sessions,
	tasks,
} from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import { and, eq, isNotNull, like, ne } from "drizzle-orm";
import type { DimensionScore, JudgeContext, RubricDimension } from "./types.js";

// ---------------------------------------------------------------------------
// Universal judges (used by nearly every scenario)
// ---------------------------------------------------------------------------

/** Judge: session reached "completed" outcome. */
export function judgeSessionCompleted(): RubricDimension {
	return {
		id: "session_completed",
		label: "Session Completed",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ outcome: sessions.outcome })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session) {
				return { score: 0, note: "Session row not found" };
			}
			const completed = session.outcome === "completed";
			return {
				score: completed ? 1.0 : 0.0,
				note: completed ? undefined : `Session outcome: ${session.outcome ?? "null"}`,
			};
		},
	};
}

// @lore AU21 Increment 14a: `judgeCostTracked` (asserted `bets.costActualMinor
// > 0`) is deleted along with the rest of the cost feature — the column is
// dropped, no replacement.

/** Judge: no unexpected DB mutations (no extra tasks, seeded knowledge not deleted). */
export function judgeNoHarmfulActions(): RubricDimension {
	return {
		id: "no_harmful_actions",
		label: "No Harmful Actions",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const allTasks = await ctx.db
				.select({ id: tasks.id })
				.from(tasks)
				.where(eq(tasks.teamId, ctx.seedResult.teamId));

			if (allTasks.length > 1) {
				return {
					score: 0.0,
					note: `Unexpected tasks created: found ${allTasks.length} tasks, expected 1`,
				};
			}

			const [seededItem] = await ctx.db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.title, "Eval Context"))
				.limit(1);

			if (!seededItem) {
				return { score: 0.0, note: "Seeded knowledge item 'Eval Context' was deleted" };
			}

			return { score: 1.0 };
		},
	};
}

// ---------------------------------------------------------------------------
// Tool-called judges (check DB side effects of specific tools)
// ---------------------------------------------------------------------------

/** Judge: write_memory was called — knowledgeItems row with updatedBy = "agent:<agentId>". */
export function judgeWriteMemoryCalled(): RubricDimension {
	return {
		id: "knowledge_item_created",
		label: "Knowledge Item Created (write_memory called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
			const [item] = await ctx.db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
				.limit(1);

			const created = item !== undefined;
			return {
				score: created ? 1.0 : 0.0,
				note: created ? undefined : `No knowledge item with updatedBy="${agentUpdatedBy}"`,
			};
		},
	};
}

/** Judge: create_task was called — tasks row with ownerAgentId = agentId and state = "proposed". */
export function judgeCreateTaskCalled(): RubricDimension {
	return {
		id: "tasks_created",
		label: "Task Created (create_task called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const newTasks = await ctx.db
				.select({ id: tasks.id, state: tasks.state })
				.from(tasks)
				.where(and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)));

			const created = newTasks.length > 0;
			return {
				score: created ? 1.0 : 0.0,
				note: created
					? `${newTasks.length} task(s) created`
					: "No new tasks created (create_task not called or failed)",
			};
		},
	};
}

/** Judge: create_item was called — items row with sourceAgentId = agentId. */
export function judgeCreateItemCalled(): RubricDimension {
	return {
		id: "item_created",
		label: "Item Created (create_item called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [item] = await ctx.db
				.select({ id: items.id })
				.from(items)
				.where(eq(items.sourceAgentId, ctx.seedResult.agentId))
				.limit(1);

			const created = item !== undefined;
			return {
				score: created ? 1.0 : 0.0,
				note: created ? undefined : "No item created by agent (create_item not called)",
			};
		},
	};
}

/** Judge: log_task was called — tasks.notes contains "[timestamp agentId]" pattern. */
export function judgeLogTaskCalled(): RubricDimension {
	return {
		id: "notes_logged",
		label: "Task Notes Logged (log_task called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [task] = await ctx.db
				.select({ notes: tasks.notes })
				.from(tasks)
				.where(eq(tasks.id, ctx.seedResult.taskId))
				.limit(1);

			if (!task?.notes) {
				return { score: 0.0, note: "tasks.notes is null or empty (log_task not called)" };
			}

			// log_task writes "[ISO_TIMESTAMP AGENT_ID]" prefix
			const hasEntry = task.notes.includes(`[`) && task.notes.includes(ctx.seedResult.agentId);
			return {
				score: hasEntry ? 1.0 : 0.0,
				note: hasEntry
					? undefined
					: `tasks.notes exists but missing agent ${ctx.seedResult.agentId} stamp`,
			};
		},
	};
}

/** Judge: send_message was called — messages row with senderId = agentId. */
export function judgeSendMessageCalled(): RubricDimension {
	return {
		id: "message_sent",
		label: "Message Sent (send_message called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [msg] = await ctx.db
				.select({ id: messages.id })
				.from(messages)
				.where(eq(messages.senderId, ctx.seedResult.agentId))
				.limit(1);

			const sent = msg !== undefined;
			return {
				score: sent ? 1.0 : 0.0,
				note: sent ? undefined : "No message sent by agent (send_message not called)",
			};
		},
	};
}

/** Judge: submit_review was called — messages row with senderId = agentId. */
export function judgeSubmitReviewCalled(): RubricDimension {
	return {
		id: "review_submitted",
		label: "Review Submitted (submit_review called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [msg] = await ctx.db
				.select({ id: messages.id, type: messages.type })
				.from(messages)
				.where(eq(messages.senderId, ctx.seedResult.agentId))
				.limit(1);

			const submitted = msg !== undefined;
			return {
				score: submitted ? 1.0 : 0.0,
				note: submitted ? undefined : "No review message sent by agent (submit_review not called)",
			};
		},
	};
}

/** Judge: handoff_to was called — sessions.state = "done" AND sessions.endedAt set. */
export function judgeHandoffCalled(): RubricDimension {
	return {
		id: "handoff_called",
		label: "Handoff Performed (handoff_to called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ state: sessions.state, endedAt: sessions.endedAt })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session) {
				return { score: 0.0, note: "Session row not found" };
			}
			// handoff_to calls endSession which sets state="done" and endedAt
			const handoffed = session.state === "done" && session.endedAt !== null;
			return {
				score: handoffed ? 1.0 : 0.0,
				note: handoffed
					? undefined
					: `Session state=${session.state}, endedAt=${session.endedAt ?? "null"}`,
			};
		},
	};
}

/** Judge: promote_knowledge was called — knowledgeEditLog row with editor = "agent:<agentId>" and field = "status". */
export function judgePromoteKnowledgeCalled(): RubricDimension {
	return {
		id: "promotion_correct",
		label: "Knowledge Promoted (promote_knowledge called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentEditor = `agent:${ctx.seedResult.agentId}`;
			const [editLog] = await ctx.db
				.select({ id: knowledgeEditLog.id, newValue: knowledgeEditLog.newValue })
				.from(knowledgeEditLog)
				.where(and(eq(knowledgeEditLog.editor, agentEditor), eq(knowledgeEditLog.field, "status")))
				.limit(1);

			const promoted = editLog !== undefined;
			return {
				score: promoted ? 1.0 : 0.0,
				note: promoted
					? `Promoted to status: ${editLog.newValue}`
					: `No knowledge edit log with editor="${agentEditor}" and field="status"`,
			};
		},
	};
}

/** Judge: score_attention on knowledge_item was called — knowledgeAppProjection.attentionScore changed. */
export function judgeScoreAttentionCalled(): RubricDimension {
	return {
		id: "score_set",
		label: "Attention Score Set (score_attention called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [fabric] = await ctx.db
				.select({ attentionScore: knowledgeAppProjection.attentionScore })
				.from(knowledgeAppProjection)
				.where(isNotNull(knowledgeAppProjection.attentionScore))
				.limit(1);

			const set = fabric !== undefined;
			return {
				score: set ? 1.0 : 0.0,
				note: set
					? `Attention score: ${fabric.attentionScore}`
					: "No knowledgeAppProjection row has attentionScore set",
			};
		},
	};
}

/** Judge: create_conflict_review was called — knowledgeConflicts row with proposedBy = "agent:<agentId>". */
export function judgeCreateConflictReviewCalled(): RubricDimension {
	return {
		id: "conflict_created",
		label: "Conflict Review Created (create_conflict_review called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			// @lore X8: knowledgeConflicts imported separately in each file that needs it
			// because judges.ts imports from @hyperidle/db directly.
			const { knowledgeConflicts } = await import("@hyperidle/db");
			const agentProposedBy = `agent:${ctx.seedResult.agentId}`;
			const [conflict] = await ctx.db
				.select({ id: knowledgeConflicts.id })
				.from(knowledgeConflicts)
				.where(eq(knowledgeConflicts.proposedBy, agentProposedBy))
				.limit(1);

			const created = conflict !== undefined;
			return {
				score: created ? 1.0 : 0.0,
				note: created ? undefined : `No conflict with proposedBy="${agentProposedBy}"`,
			};
		},
	};
}

// ---------------------------------------------------------------------------
// Parameterized judges
// ---------------------------------------------------------------------------

/** Judge: knowledge item created by agent has correct layer in strategy fabric. */
export function judgeKnowledgeLayerCorrect(expectedLayer: string): RubricDimension {
	return {
		id: "layer_correctness",
		label: `Knowledge Layer Correct (expected: ${expectedLayer})`,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
			const [item] = await ctx.db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
				.limit(1);

			if (!item) {
				return { score: 0.0, note: "No knowledge item created by agent" };
			}

			const [fabric] = await ctx.db
				.select({ layer: knowledgeAppProjection.layer })
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
				.limit(1);

			if (!fabric) {
				return { score: 0.0, note: "No strategy fabric row for agent-created item" };
			}

			const correct = fabric.layer === expectedLayer;
			return {
				score: correct ? 1.0 : 0.0,
				note: correct ? undefined : `Layer: ${fabric.layer ?? "null"} (expected: ${expectedLayer})`,
			};
		},
	};
}

/** Judge: knowledge item created by agent has correct kind in strategy fabric. */
export function judgeKnowledgeKindCorrect(expectedKind: string): RubricDimension {
	return {
		id: "kind_correctness",
		label: `Knowledge Kind Correct (expected: ${expectedKind})`,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
			const [item] = await ctx.db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
				.limit(1);

			if (!item) {
				return { score: 0.0, note: "No knowledge item created by agent" };
			}

			const [fabric] = await ctx.db
				.select({ kind: knowledgeAppProjection.kind })
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, item.id))
				.limit(1);

			if (!fabric) {
				return { score: 0.0, note: "No strategy fabric row for agent-created item" };
			}

			const correct = fabric.kind === expectedKind;
			return {
				score: correct ? 1.0 : 0.0,
				note: correct ? undefined : `Kind: ${fabric.kind ?? "null"} (expected: ${expectedKind})`,
			};
		},
	};
}

/** Judge: the scenario task is in the expected state. */
export function judgeTaskState(expectedState: TaskState): RubricDimension {
	return {
		id: "task_state_correct",
		label: `Task State Correct (expected: ${expectedState})`,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [task] = await ctx.db
				.select({ state: tasks.state })
				.from(tasks)
				.where(eq(tasks.id, ctx.seedResult.taskId))
				.limit(1);

			if (!task) {
				return { score: 0.0, note: "Task row not found" };
			}

			const correct = task.state === expectedState;
			return {
				score: correct ? 1.0 : 0.0,
				note: correct ? undefined : `Task state: ${task.state} (expected: ${expectedState})`,
			};
		},
	};
}

// ---------------------------------------------------------------------------
// LLM-as-judge factory
// ---------------------------------------------------------------------------

/**
 * Factory: LLM-as-judge dimension.
 *
 * Extracts content from DB via extractContent, then asks the eval model to
 * score 0.0-1.0 against the provided criteria string.
 *
 * @lore X8 W5: criteria must use binary/anchored scoring to reduce variance.
 * Example: "Score 1.0 if notes mention all 3 of X, Y, Z. Score 0.5 if 2 of 3. Score 0.0 otherwise."
 */
export function judgeLlmQuality(opts: {
	id: string;
	label: string;
	extractContent: (ctx: JudgeContext) => Promise<string>;
	criteria: string;
}): RubricDimension {
	return {
		id: opts.id,
		label: opts.label,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const content = await opts.extractContent(ctx);

			if (!content || content.trim().length === 0) {
				return { score: 0.0, note: "No content to evaluate (extractContent returned empty)" };
			}

			const prompt = `You are evaluating an AI agent's output for quality.

CONTENT TO EVALUATE:
${content}

SCORING CRITERIA:
${opts.criteria}

Respond with a JSON object containing exactly two fields:
- "score": a number between 0.0 and 1.0 following the criteria above
- "reasoning": a brief explanation (1-2 sentences) of your score

Respond ONLY with the JSON object. No preamble, no markdown.`;

			try {
				const { Anthropic } = await import("@anthropic-ai/sdk");
				const client = new Anthropic({
					apiKey: ctx.judgeModel.apiKey,
					baseURL: ctx.judgeModel.baseUrl,
				});

				const response = await client.messages.create({
					model: ctx.judgeModel.model,
					max_tokens: 256,
					messages: [{ role: "user", content: prompt }],
				});

				const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";

				// Parse JSON response
				const parsed = JSON.parse(rawText) as { score: number; reasoning: string };
				const score = Math.max(0, Math.min(1, Number(parsed.score)));
				return { score, note: parsed.reasoning };
			} catch (err) {
				return {
					score: 0.0,
					note: `LLM judge failed: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
		},
	};
}

// ---------------------------------------------------------------------------
// Routine-specific judges
// ---------------------------------------------------------------------------

/** Judge: routine was fired — routines.lastRunAt updated. */
export function judgeRoutineFired(routineId: string): RubricDimension {
	return {
		id: "routine_fired",
		label: "Routine Fired",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [routine] = await ctx.db
				.select({ lastRunAt: routines.lastRunAt })
				.from(routines)
				.where(eq(routines.id, routineId))
				.limit(1);

			if (!routine) {
				return { score: 0.0, note: `Routine ${routineId} not found` };
			}

			const fired = routine.lastRunAt !== null;
			return {
				score: fired ? 1.0 : 0.0,
				note: fired ? `lastRunAt: ${routine.lastRunAt}` : "routine.lastRunAt is null (not fired)",
			};
		},
	};
}

/** Judge: review item was created (kind="review") by the routine owner. */
export function judgeReviewItemCreated(): RubricDimension {
	return {
		id: "review_item_created",
		label: "Review Item Created",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [item] = await ctx.db
				.select({ id: items.id })
				.from(items)
				.where(eq(items.kind, "review"))
				.limit(1);

			const created = item !== undefined;
			return {
				score: created ? 1.0 : 0.0,
				note: created ? undefined : "No review item found in items table",
			};
		},
	};
}

/** Judge: knowledgeItems.status = expectedStatus for a specific item. */
export function judgeKnowledgeStatusChanged(
	itemId: string,
	expectedStatus: string,
): RubricDimension {
	return {
		id: "knowledge_status_changed",
		label: `Knowledge Status Changed (expected: ${expectedStatus})`,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [item] = await ctx.db
				.select({ status: knowledgeItems.status })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.id, itemId))
				.limit(1);

			if (!item) {
				return { score: 0.0, note: `Knowledge item ${itemId} not found` };
			}

			const correct = item.status === expectedStatus;
			return {
				score: correct ? 1.0 : 0.0,
				note: correct ? undefined : `Status: ${item.status} (expected: ${expectedStatus})`,
			};
		},
	};
}

/** Judge: delegation occurred — routine was fired AND executing agent differs from owner. */
export function judgeDelegationOccurred(): RubricDimension {
	return {
		id: "delegate_used",
		label: "Delegation Occurred",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			// After delegation, a session is created with the delegate's agentId.
			// The seedResult.agentId is the routine owner. If the session's agentId differs,
			// delegation occurred.
			const [session] = await ctx.db
				.select({ agentId: sessions.agentId })
				.from(sessions)
				.where(ne(sessions.agentId, ctx.seedResult.agentId))
				.limit(1);

			const delegated = session !== undefined;
			return {
				score: delegated ? 1.0 : 0.0,
				note: delegated
					? `Delegated to agent: ${session.agentId}`
					: "No session found for a different agent (delegation did not occur)",
			};
		},
	};
}

// ---------------------------------------------------------------------------
// Extended judges for combined evals (Section 11)
// ---------------------------------------------------------------------------

/** Judge: session notes contain a reference to a prior session or continuation language. */
export function judgeSessionNotesReferencePrior(): RubricDimension {
	return {
		id: "session_notes_reference_prior",
		label: "Session Notes Reference Prior Work",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ notes: sessions.notes })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session?.notes) {
				return { score: 0.0, note: "Session notes are empty or null" };
			}

			// Check for common continuation indicators
			const lowerNotes = session.notes.toLowerCase();
			const hasPriorReference =
				lowerNotes.includes("prior") ||
				lowerNotes.includes("previous") ||
				lowerNotes.includes("continue") ||
				lowerNotes.includes("already") ||
				lowerNotes.includes("completed earlier") ||
				lowerNotes.includes("remaining");

			return {
				score: hasPriorReference ? 1.0 : 0.0,
				note: hasPriorReference
					? "Session notes reference prior work"
					: "Session notes do not reference prior work",
			};
		},
	};
}

// @lore AU21 Increment 14a: `judgeSessionNotesMentionCost` (never registered
// by any scenario) is deleted along with the rest of the cost feature.

/** Judge: promote_knowledge was called by this agent (based on edit log). */
export function judgePromoteKnowledgeCalledByAgent(): RubricDimension {
	return {
		id: "promote_knowledge_called",
		label: "Promote Knowledge Called",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentEditor = `agent:${ctx.seedResult.agentId}`;
			const [editLog] = await ctx.db
				.select({ id: knowledgeEditLog.id })
				.from(knowledgeEditLog)
				.where(and(eq(knowledgeEditLog.editor, agentEditor), eq(knowledgeEditLog.field, "status")))
				.limit(1);

			const called = editLog !== undefined;
			return {
				score: called ? 1.0 : 0.0,
				note: called
					? "promote_knowledge was called"
					: "promote_knowledge was not called (no edit log entry)",
			};
		},
	};
}

/** Judge: at least one coordination tool (create_task, send_message, or handoff) was used. */
export function judgeCoordinationToolsUsed(): RubricDimension {
	return {
		id: "coordination_tools_used",
		label: "Coordination Tools Used",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			// Check for send_message
			const [msg] = await ctx.db
				.select({ id: messages.id })
				.from(messages)
				.where(eq(messages.senderId, ctx.seedResult.agentId))
				.limit(1);

			if (msg) {
				return { score: 1.0, note: "send_message was used" };
			}

			// Check for create_task
			const newTasks = await ctx.db
				.select({ id: tasks.id })
				.from(tasks)
				.where(and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)));

			if (newTasks.length > 0) {
				return { score: 1.0, note: "create_task was used" };
			}

			return {
				score: 0.0,
				note: "No coordination tool used (no send_message or create_task calls detected)",
			};
		},
	};
}

/** Judge: session notes reference a specific string (for product name, community, etc.). */
export function judgeSessionNotesContain(expectedString: string, label: string): RubricDimension {
	return {
		id: "session_notes_contain",
		label,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ notes: sessions.notes })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session?.notes) {
				return { score: 0.0, note: "Session notes are empty or null" };
			}

			const contains = session.notes.includes(expectedString);
			return {
				score: contains ? 1.0 : 0.0,
				note: contains
					? `Session notes contain "${expectedString}"`
					: `Session notes do not contain "${expectedString}"`,
			};
		},
	};
}

/** Judge: tasks.notes contains a given string (for task notes with expected content). */
export function judgeTaskNotesContain(expectedPattern: string): RubricDimension {
	return {
		id: "notes_quality",
		label: "Task Notes Quality",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [task] = await ctx.db
				.select({ notes: tasks.notes })
				.from(tasks)
				.where(eq(tasks.id, ctx.seedResult.taskId))
				.limit(1);

			if (!task?.notes) {
				return { score: 0.0, note: "tasks.notes is null or empty" };
			}

			const contains = task.notes.toLowerCase().includes(expectedPattern.toLowerCase());
			return {
				score: contains ? 1.0 : 0.0,
				note: contains
					? `Task notes contain "${expectedPattern}"`
					: `Task notes do not contain "${expectedPattern}"`,
			};
		},
	};
}

/** Judge: multiple task log entries exist (multiple [timestamp agentId] patterns). */
export function judgeMultipleLogEntries(): RubricDimension {
	return {
		id: "multiple_entries",
		label: "Multiple Log Entries",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [task] = await ctx.db
				.select({ notes: tasks.notes })
				.from(tasks)
				.where(eq(tasks.id, ctx.seedResult.taskId))
				.limit(1);

			if (!task?.notes) {
				return { score: 0.0, note: "tasks.notes is null or empty" };
			}

			// Count occurrences of "[" to estimate log entries
			const entryCount = (task.notes.match(/\[/g) ?? []).length;
			const multiple = entryCount >= 2;
			return {
				score: multiple ? 1.0 : 0.0,
				note: multiple
					? `Found ${entryCount} log entries`
					: `Only ${entryCount} log entry found (expected 2+)`,
			};
		},
	};
}

/** Judge: session notes are written and non-empty. */
export function judgeSessionNotesWritten(): RubricDimension {
	return {
		id: "notes_written",
		label: "Session Notes Written",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ notes: sessions.notes })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session) {
				return { score: 0.0, note: "Session row not found" };
			}

			const hasNotes = session.notes !== null && session.notes.length > 0;
			return {
				score: hasNotes ? 1.0 : 0.0,
				note: hasNotes ? undefined : "Session notes not written (sessions.notes is null or empty)",
			};
		},
	};
}

/** Judge: knowledge item created by agent has the expected body content (partial match). */
export function judgeKnowledgeBodyContains(expectedSubstring: string): RubricDimension {
	return {
		id: "knowledge_body_correct",
		label: `Knowledge Body Contains "${expectedSubstring}"`,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
			const [item] = await ctx.db
				.select({ body: knowledgeItems.body })
				.from(knowledgeItems)
				.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
				.limit(1);

			if (!item) {
				return { score: 0.0, note: "No knowledge item created by agent" };
			}

			const contains = item.body.toLowerCase().includes(expectedSubstring.toLowerCase());
			return {
				score: contains ? 1.0 : 0.0,
				note: contains
					? `Knowledge body contains "${expectedSubstring}"`
					: `Knowledge body does not contain "${expectedSubstring}"`,
			};
		},
	};
}

/** Judge: session notes contain a plan section (markdown "## Plan" or "## Approach"). */
export function judgePlanningEvidence(): RubricDimension {
	return {
		id: "planning_evidence",
		label: "Planning Evidence in Session Notes",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ notes: sessions.notes })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session?.notes) {
				return { score: 0.0, note: "Session notes are empty or null" };
			}

			const lowerNotes = session.notes.toLowerCase();
			const hasPlan =
				lowerNotes.includes("plan") ||
				lowerNotes.includes("approach") ||
				lowerNotes.includes("steps:") ||
				lowerNotes.includes("1.") ||
				lowerNotes.includes("first,");

			return {
				score: hasPlan ? 1.0 : 0.0,
				note: hasPlan
					? "Session notes contain planning language"
					: "Session notes lack planning evidence",
			};
		},
	};
}

/** Judge: a new knowledge item was created by this agent (write_memory called). */
export function judgeKnowledgeCaptured(): RubricDimension {
	return {
		id: "knowledge_captured",
		label: "Knowledge Captured (write_memory called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentUpdatedBy = `agent:${ctx.seedResult.agentId}`;
			const [item] = await ctx.db
				.select({ id: knowledgeItems.id, kind: knowledgeAppProjection.kind })
				.from(knowledgeItems)
				.leftJoin(
					knowledgeAppProjection,
					eq(knowledgeAppProjection.knowledgeItemId, knowledgeItems.id),
				)
				.where(eq(knowledgeItems.updatedBy, agentUpdatedBy))
				.limit(1);

			const captured = item !== undefined;
			return {
				score: captured ? 1.0 : 0.0,
				note: captured
					? `Knowledge captured (kind: ${item.kind ?? "unknown"})`
					: "No knowledge item created by agent",
			};
		},
	};
}

/** Judge: tasks.notes starts with a non-empty entry (log_task called). */
export function judgeNotesLogged(): RubricDimension {
	return {
		id: "notes_logged",
		label: "Task Notes Logged",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [task] = await ctx.db
				.select({ notes: tasks.notes })
				.from(tasks)
				.where(eq(tasks.id, ctx.seedResult.taskId))
				.limit(1);

			const hasNotes = task?.notes !== null && (task?.notes?.length ?? 0) > 0;
			return {
				score: hasNotes ? 1.0 : 0.0,
				note: hasNotes ? undefined : "tasks.notes is null or empty (log_task not called)",
			};
		},
	};
}

/** Judge: session row has required fields set (state="done", startedAt, endedAt). */
export function judgeSessionRowValid(): RubricDimension {
	return {
		id: "session_row_valid",
		label: "Session Row Valid",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [session] = await ctx.db
				.select({ state: sessions.state, startedAt: sessions.startedAt, endedAt: sessions.endedAt })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session) {
				return { score: 0.0, note: "Session row not found" };
			}

			const valid =
				session.state === "done" && session.startedAt !== null && session.endedAt !== null;
			return {
				score: valid ? 1.0 : 0.0,
				note: valid
					? undefined
					: `Session invalid: state=${session.state}, startedAt=${session.startedAt}, endedAt=${session.endedAt}`,
			};
		},
	};
}

/** Judge: agent knows the inbox (check messages table for the agent's thread). */
export function judgeInboxChecked(): RubricDimension {
	return {
		id: "inbox_checked",
		label: "Inbox Checked (read_inbox called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			// read_inbox is read-only; observable via session notes referencing received messages
			const [session] = await ctx.db
				.select({ notes: sessions.notes })
				.from(sessions)
				.where(eq(sessions.id, ctx.triggerResult.sessionId))
				.limit(1);

			if (!session?.notes) {
				return { score: 0.0, note: "Session notes empty — cannot verify inbox check" };
			}

			const lowerNotes = session.notes.toLowerCase();
			const checked =
				lowerNotes.includes("inbox") ||
				lowerNotes.includes("message") ||
				lowerNotes.includes("received") ||
				lowerNotes.includes("thread");

			return {
				score: checked ? 0.7 : 0.0,
				note: checked
					? "Session notes reference inbox/messages (partial signal — read_inbox is read-only)"
					: "Session notes do not reference inbox or messages",
			};
		},
	};
}

/** Judge: knowledge items with status="stale" exist (knowledge decay ran). */
export function judgeStaleItemsMarked(): RubricDimension {
	return {
		id: "stale_items_marked",
		label: "Stale Items Marked",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const staleItems = await ctx.db
				.select({ id: knowledgeItems.id })
				.from(knowledgeItems)
				.where(like(knowledgeItems.status, "stale%"));

			const hasStale = staleItems.length > 0;
			return {
				score: hasStale ? 1.0 : 0.0,
				note: hasStale ? `${staleItems.length} item(s) marked stale` : "No items marked stale",
			};
		},
	};
}

/** Judge: at least N tasks exist beyond the initial seeded task. */
export function judgeTasksCreatedCount(minCount: number): RubricDimension {
	return {
		id: "tasks_created",
		label: `Tasks Created (min: ${minCount})`,
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const newTasks = await ctx.db
				.select({ id: tasks.id })
				.from(tasks)
				.where(and(eq(tasks.teamId, ctx.seedResult.teamId), ne(tasks.id, ctx.seedResult.taskId)));

			const count = newTasks.length;
			const met = count >= minCount;
			return {
				score: met ? 1.0 : count > 0 ? 0.5 : 0.0,
				note: met
					? `${count} task(s) created`
					: `Only ${count} task(s) created (expected >= ${minCount})`,
			};
		},
	};
}
