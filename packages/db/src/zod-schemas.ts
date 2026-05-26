/**
 * Drizzle-Zod generated base schemas for all 19 HyperIdle tables.
 *
 * These are generated from the Drizzle table definitions via `drizzle-zod`.
 * They provide base-level validation for select and insert operations.
 *
 * @lore api-typesafety: Using drizzle-zod createSelectSchema / createInsertSchema
 * rather than handwriting Zod schemas. The generated schemas stay in sync with
 * the Drizzle table definitions automatically — no drift between DB types and
 * validation.
 */

import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
	artifacts,
	bets,
	factorySettings,
	items,
	knowledgeAccessLog,
	knowledgeConflicts,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	notificationQueue,
	products,
	propagationLog,
	routines,
	sessions,
	tasks,
	teams,
	threads,
	userSkills,
	users,
} from "./schema.js";

// ─── Select schemas ───────────────────────────────────────────────────────────

export const selectProductSchema = createSelectSchema(products);
export const selectUserSchema = createSelectSchema(users);
export const selectTeamSchema = createSelectSchema(teams);
export const selectBetSchema = createSelectSchema(bets);
export const selectTaskSchema = createSelectSchema(tasks);
export const selectSessionSchema = createSelectSchema(sessions);
export const selectRoutineSchema = createSelectSchema(routines);
export const selectThreadSchema = createSelectSchema(threads);
export const selectMessageSchema = createSelectSchema(messages);
export const selectItemSchema = createSelectSchema(items);
export const selectUserSkillSchema = createSelectSchema(userSkills);
export const selectFactorySettingSchema = createSelectSchema(factorySettings);
export const selectKnowledgeItemSchema = createSelectSchema(knowledgeItems);
export const selectKnowledgeEditLogSchema = createSelectSchema(knowledgeEditLog);
export const selectKnowledgeAccessLogSchema = createSelectSchema(knowledgeAccessLog);
export const selectKnowledgeConflictSchema = createSelectSchema(knowledgeConflicts);
export const selectNotificationQueueSchema = createSelectSchema(notificationQueue);
export const selectPropagationLogSchema = createSelectSchema(propagationLog);
export const selectArtifactSchema = createSelectSchema(artifacts);

// ─── Insert schemas ───────────────────────────────────────────────────────────

export const insertProductSchema = createInsertSchema(products);
export const insertUserSchema = createInsertSchema(users);
export const insertTeamSchema = createInsertSchema(teams);

// ─── P2 backward-compat aliases (agent → user rename) ────────────────────────
// @lore P2: keep old names as re-exports so existing tests compiled before the
// rename continue to pass without a mass-update. New code should use selectUserSchema
// / insertUserSchema / selectUserSkillSchema.
export const selectAgentSchema = selectUserSchema;
export const insertAgentSchema = insertUserSchema;
export const selectAgentSkillSchema = selectUserSkillSchema;
export const insertBetSchema = createInsertSchema(bets);
export const insertTaskSchema = createInsertSchema(tasks);
export const insertSessionSchema = createInsertSchema(sessions);
export const insertRoutineSchema = createInsertSchema(routines);
export const insertThreadSchema = createInsertSchema(threads);
export const insertMessageSchema = createInsertSchema(messages);
export const insertItemSchema = createInsertSchema(items);
export const insertArtifactSchema = createInsertSchema(artifacts);
