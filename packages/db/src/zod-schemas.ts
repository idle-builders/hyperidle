/**
 * Drizzle-Zod generated base schemas for all HyperIdle tables.
 *
 * These are generated from the Drizzle table definitions via `drizzle-zod`.
 * They provide base-level validation for select and insert operations.
 *
 * @lore api-typesafety: Using drizzle-zod createSelectSchema / createInsertSchema
 * rather than handwriting Zod schemas. The generated schemas stay in sync with
 * the Drizzle table definitions automatically — no drift between DB types and
 * validation.
 *
 * @lore U1: selectTeamSchema now maps to the `teams` table (formerly `products`).
 * selectTeamMemberSchema replaces the old selectTeamSchema (formerly `teams` agent membership).
 * insertTeamSchema replaces insertProductSchema. insertTeamMemberSchema replaces insertTeamSchema.
 */

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
	artifacts,
	bets,
	items,
	knowledgeAccessLog,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	notificationQueue,
	propagationLog,
	routines,
	sessions,
	tasks,
	teamMembers,
	teams,
	threads,
	userSkills,
	users,
} from "./schema.js";

// ─── Select schemas ───────────────────────────────────────────────────────────

export const selectTeamSchema = createSelectSchema(teams);
export const selectUserSchema = createSelectSchema(users);
export const selectTeamMemberSchema = createSelectSchema(teamMembers);
/**
 * AK3: decompositionStatus and decompositionBlockerReason are nullable columns
 * with no DB default. drizzle-zod generates them as required-nullable, which
 * breaks pre-existing test fixtures that omit these fields. Mark them optional
 * so existing fixtures (and sparse API responses) don't need to include them.
 *
 * @lore AK3: nullable columns added after schema freeze must be .optional() in
 * the Zod schema to avoid breaking pre-existing test fixtures that don't know
 * about the new columns. Pattern: createSelectSchema + column overrides.
 */
export const selectBetSchema = createSelectSchema(bets, {
	decompositionStatus: (s) => s.optional(),
	decompositionBlockerReason: (s) => s.optional(),
	/**
	 * AK5: nullable FK column added after schema freeze — mark optional so
	 * pre-existing test fixtures that omit this field don't need to include it.
	 * Same pattern as AK3 decompositionStatus/decompositionBlockerReason.
	 */
	sourceKnowledgeItemId: (s) => s.optional(),
});
export const selectTaskSchema = createSelectSchema(tasks);
export const selectSessionSchema = createSelectSchema(sessions);
export const selectRoutineSchema = createSelectSchema(routines);
export const selectThreadSchema = createSelectSchema(threads);
export const selectMessageSchema = createSelectSchema(messages);
export const selectItemSchema = createSelectSchema(items);
export const selectUserSkillSchema = createSelectSchema(userSkills);
export const selectKnowledgeItemSchema = createSelectSchema(knowledgeItems);
export const selectKnowledgeEditLogSchema = createSelectSchema(knowledgeEditLog);
export const selectKnowledgeAccessLogSchema = createSelectSchema(knowledgeAccessLog);
export const selectKnowledgeConflictSchema = createSelectSchema(knowledgeConflicts);
export const selectNotificationQueueSchema = createSelectSchema(notificationQueue);
export const selectPropagationLogSchema = createSelectSchema(propagationLog);
export const selectArtifactSchema = createSelectSchema(artifacts);

// ─── Insert schemas ───────────────────────────────────────────────────────────

export const insertTeamSchema = createInsertSchema(teams);
export const insertUserSchema = createInsertSchema(users);
export const insertTeamMemberSchema = createInsertSchema(teamMembers);

export const insertBetSchema = createInsertSchema(bets);
export const insertTaskSchema = createInsertSchema(tasks);
export const insertSessionSchema = createInsertSchema(sessions);
export const insertRoutineSchema = createInsertSchema(routines);
export const insertThreadSchema = createInsertSchema(threads);
export const insertMessageSchema = createInsertSchema(messages);
export const insertItemSchema = createInsertSchema(items);
export const insertArtifactSchema = createInsertSchema(artifacts);
