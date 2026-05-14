/**
 * Drizzle-Zod generated base schemas for all 20 HyperIdle tables.
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
	agentSkills,
	agents,
	artifacts,
	bets,
	factorySettings,
	fileLeases,
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
} from "./schema.js";

// ─── Select schemas ───────────────────────────────────────────────────────────

export const selectProductSchema = createSelectSchema(products);
export const selectAgentSchema = createSelectSchema(agents);
export const selectTeamSchema = createSelectSchema(teams);
export const selectBetSchema = createSelectSchema(bets);
export const selectTaskSchema = createSelectSchema(tasks);
export const selectSessionSchema = createSelectSchema(sessions);
export const selectRoutineSchema = createSelectSchema(routines);
export const selectThreadSchema = createSelectSchema(threads);
export const selectMessageSchema = createSelectSchema(messages);
export const selectItemSchema = createSelectSchema(items);
export const selectAgentSkillSchema = createSelectSchema(agentSkills);
export const selectFactorySettingSchema = createSelectSchema(factorySettings);
export const selectKnowledgeItemSchema = createSelectSchema(knowledgeItems);
export const selectKnowledgeEditLogSchema = createSelectSchema(knowledgeEditLog);
export const selectKnowledgeAccessLogSchema = createSelectSchema(knowledgeAccessLog);
export const selectKnowledgeConflictSchema = createSelectSchema(knowledgeConflicts);
export const selectNotificationQueueSchema = createSelectSchema(notificationQueue);
export const selectFileLeaseSchema = createSelectSchema(fileLeases);
export const selectPropagationLogSchema = createSelectSchema(propagationLog);
export const selectArtifactSchema = createSelectSchema(artifacts);

// ─── Insert schemas ───────────────────────────────────────────────────────────

export const insertProductSchema = createInsertSchema(products);
export const insertAgentSchema = createInsertSchema(agents);
export const insertTeamSchema = createInsertSchema(teams);
export const insertBetSchema = createInsertSchema(bets);
export const insertTaskSchema = createInsertSchema(tasks);
export const insertSessionSchema = createInsertSchema(sessions);
export const insertRoutineSchema = createInsertSchema(routines);
export const insertThreadSchema = createInsertSchema(threads);
export const insertMessageSchema = createInsertSchema(messages);
export const insertItemSchema = createInsertSchema(items);
export const insertAgentSkillSchema = createInsertSchema(agentSkills);
export const insertFactorySettingSchema = createInsertSchema(factorySettings);
export const insertKnowledgeItemSchema = createInsertSchema(knowledgeItems);
export const insertKnowledgeEditLogSchema = createInsertSchema(knowledgeEditLog);
export const insertKnowledgeAccessLogSchema = createInsertSchema(knowledgeAccessLog);
export const insertKnowledgeConflictSchema = createInsertSchema(knowledgeConflicts);
export const insertNotificationQueueSchema = createInsertSchema(notificationQueue);
export const insertFileLeaseSchema = createInsertSchema(fileLeases);
export const insertPropagationLogSchema = createInsertSchema(propagationLog);
export const insertArtifactSchema = createInsertSchema(artifacts);

// ─── Inferred types ───────────────────────────────────────────────────────────

export type SelectProduct = typeof selectProductSchema._type;
export type InsertProduct = typeof insertProductSchema._type;
