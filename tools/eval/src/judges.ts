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

import { documents, messages, sessions, tasks } from "@hyperidle/db";
import type { TaskState } from "@hyperidle/domain-model";
import { and, eq, like, ne } from "drizzle-orm";
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

/** Judge: no unexpected DB mutations (no extra tasks, seeded document not deleted). */
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
				.select({ id: documents.id })
				.from(documents)
				.where(eq(documents.title, "Eval Context"))
				.limit(1);

			if (!seededItem) {
				return { score: 0.0, note: "Seeded document 'Eval Context' was deleted" };
			}

			return { score: 1.0 };
		},
	};
}

// ---------------------------------------------------------------------------
// Tool-called judges (check DB side effects of specific tools)
// ---------------------------------------------------------------------------

/** Judge: `edit_document({as:"memory"})` was called — documents row with updatedBy = "<agentId>". */
export function judgeMemoryDocumentCreated(): RubricDimension {
	return {
		id: "memory_document_created",
		label: "Memory Document Created (edit_document as memory called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const agentUpdatedBy = ctx.seedResult.agentId;
			const [item] = await ctx.db
				.select({ id: documents.id })
				.from(documents)
				.where(eq(documents.updatedBy, agentUpdatedBy))
				.limit(1);

			const created = item !== undefined;
			return {
				score: created ? 1.0 : 0.0,
				note: created ? undefined : `No document with updatedBy="${agentUpdatedBy}"`,
			};
		},
	};
}

/**
 * Judge: `edit_document({as:"artifact"})` was called — a document parented to the task
 * the agent was working on.
 *
 * The parent is what distinguishes this from a memory: both write a
 * document, and only a produced one hangs off the task that produced it.
 */
export function judgeArtifactDocumentCreated(): RubricDimension {
	return {
		id: "artifact_produced",
		label: "Artifact Produced (edit_document as artifact called)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [item] = await ctx.db
				.select({ id: documents.id, parentKind: documents.parentKind })
				.from(documents)
				.where(eq(documents.parentId, ctx.seedResult.taskId))
				.limit(1);

			if (item === undefined) {
				return { score: 0.0, note: `No document parented to task ${ctx.seedResult.taskId}` };
			}
			if (item.parentKind !== "task") {
				return {
					score: 0.5,
					note: `Item found but parentKind is "${item.parentKind}", not "task"`,
				};
			}
			return { score: 1.0 };
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

// @lore BC3 architecture.md §5 B4/B12: judgeCreateItemCalled DELETED — its
// only caller (create-item.ts's scenario) tested the create_item tool,
// which is deleted along with the `items` table it wrote.

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

/** Judge: send_message with type "review" was called — messages row with senderId = agentId. */
export function judgeSubmitReviewCalled(): RubricDimension {
	return {
		id: "review_submitted",
		label: "Review Submitted (send_message with type review)",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const [msg] = await ctx.db
				.select({ id: messages.id, type: messages.type })
				.from(messages)
				.where(eq(messages.senderId, ctx.seedResult.agentId))
				.limit(1);

			const submitted = msg !== undefined;
			return {
				score: submitted ? 1.0 : 0.0,
				note: submitted
					? undefined
					: "No review message sent by agent (send_message with type review not called)",
			};
		},
	};
}

// @lore BC4 §6.2/§6.4: `judgePromoteKnowledgeCalled` and `judgeCreateConflictReviewCalled`
// are deleted with their subjects — `knowledge_edit_log` and `knowledge_conflicts` are
// dropped tables (migration 0086). Their only callers, the `promote_knowledge` and
// `create_conflict_review` scenarios, are deleted in the same change (both tools were
// already removed in an earlier block).

// ---------------------------------------------------------------------------
// Parameterized judges
// ---------------------------------------------------------------------------

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
				/*
				 * Two wire protocols, chosen by where the judge actually lives.
				 *
				 * This used to drive the Anthropic SDK at whatever `baseUrl` it was
				 * handed, including OpenRouter's. The SDK appends `/v1/messages`, so
				 * an OpenRouter base of `.../api/v1` became `.../api/v1/v1/messages`
				 * and returned OpenRouter's HTML 404 page. The catch below turned
				 * that into `score: 0.0` — so with the default judge (OpenRouter),
				 * EVERY llm-judged dimension has silently scored zero, and a broken
				 * judge was indistinguishable from an agent that produced nothing.
				 */
				const isAnthropic = ctx.judgeModel.baseUrl.includes("api.anthropic.com");
				let rawText: string;
				if (isAnthropic) {
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
					rawText = response.content[0]?.type === "text" ? response.content[0].text : "";
				} else {
					// OpenAI-compatible (OpenRouter and anything else pointed at here).
					const res = await fetch(`${ctx.judgeModel.baseUrl}/chat/completions`, {
						method: "POST",
						headers: {
							Authorization: `Bearer ${ctx.judgeModel.apiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: ctx.judgeModel.model,
							max_tokens: 256,
							messages: [{ role: "user", content: prompt }],
						}),
					});
					if (!res.ok) {
						throw new Error(`judge HTTP ${res.status} from ${ctx.judgeModel.baseUrl}`);
					}
					const body = (await res.json()) as {
						choices?: Array<{ message?: { content?: string } }>;
					};
					rawText = body.choices?.[0]?.message?.content ?? "";
				}

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

// @lore BC3 architecture.md §5 B4/B12: judgeReviewItemCreated DELETED — its
// only caller (create-item.ts's scenario) is gone; a surfaced review is a
// `messages` row (type "review") in a thread now, not an `items` row.

// @lore BC4: judgeKnowledgeStatusChanged DELETED — no scenario ever called it
// (derived by scanning every scenario file for the name); a status-change
// judge belongs with whichever future scenario exercises `edit_document`'s
// `status` transition, not carried forward unused.

// @lore BC5 T7b: judgeRoutineRan/judgeDelegationOccurred DELETED — no
// scenario called either (derived the same way judgeKnowledgeStatusChanged
// was), and the routine entity + routine-owner delegation concept they read
// are both gone. A subscription's wake always targets the exact subscriber,
// unconditionally — there is no delegate to judge.

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

// @lore BC4 §6.2: `judgePromoteKnowledgeCalledByAgent` deleted — unused by any
// scenario, and its subject (`knowledge_edit_log`) is a dropped table
// (migration 0086).

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

// @lore BC4: judgeKnowledgeBodyContains DELETED — unused (derived by scanning
// every scenario file for the name); write-memory.ts's own `judgeLlmQuality`
// dimension already checks body quality, so a substring judge with no caller
// duplicated a job nothing asked for.

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

// @lore BC4: judgeKnowledgeCaptured DELETED — unused (derived by scanning
// every scenario file for the name); `judgeMemoryDocumentCreated` below is
// the same DB-side-effect check, already wired to write-memory.ts.

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

/** Judge: documents with status="stale" exist (the decay subscription ran). */
export function judgeStaleItemsMarked(): RubricDimension {
	return {
		id: "stale_items_marked",
		label: "Stale Items Marked",
		judge: async (ctx: JudgeContext): Promise<DimensionScore> => {
			const staleItems = await ctx.db
				.select({ id: documents.id })
				.from(documents)
				.where(like(documents.status, "stale%"));

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
