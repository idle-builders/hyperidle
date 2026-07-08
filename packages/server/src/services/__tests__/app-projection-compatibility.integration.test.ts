import {
	bets,
	knowledgeAppProjection,
	knowledgeItems,
	taskPlanningSignals,
	tasks,
	teamMembers,
	teams,
	users,
} from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { test as fixtureTest } from "../../test-fixtures.js";
import {
	getKnowledgeProjection,
	getTaskPlanningSignal,
	upsertKnowledgeProjection,
	upsertTaskPlanningSignal,
} from "../knowledge/projections.js";

describe("app projection compatibility", () => {
	fixtureTest(
		"reads and updates historical projection rows through app-owned services",
		async ({ db }) => {
			const now = new Date().toISOString();
			await db
				.insert(teams)
				.values({ id: "team-au3-proj", name: "AU3", phase: "build", createdAt: now });
			await db
				.insert(teamMembers)
				.values({ id: "tm-au3-proj", teamId: "team-au3-proj", capacity: 3, formedAt: now });
			await db.insert(users).values({
				id: "agent-au3-proj",
				kind: "ai",
				name: "Agent",
				role: "builder",
				status: "active",
				teamId: "tm-au3-proj",
				createdAt: now,
			});
			await db.insert(bets).values({
				id: "bet-au3-proj",
				teamId: "team-au3-proj",
				description: "Projection compatibility",
				status: "active",
				createdAt: now,
			});
			await db.insert(tasks).values({
				id: "task-au3-proj",
				betId: "bet-au3-proj",
				teamId: "team-au3-proj",
				title: "Projection task",
				state: "accepted",
				ownerAgentId: "agent-au3-proj",
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(knowledgeItems).values({
				id: "ki-au3-proj",
				scopeKind: "factory",
				scopeId: null,
				title: "Historical projection",
				body: "Compatibility row",
				format: "markdown",
				status: "active",
				version: 1,
				updatedBy: "agent-au3-proj",
				createdAt: now,
				updatedAt: now,
			});

			await db.execute(
				`INSERT INTO knowledge_strategy_fabric
				(id, knowledge_item_id, layer, kind, attention_score, relevance_score, confidence)
			 VALUES ('ksf-au3-proj', 'ki-au3-proj', 'L3', 'pattern', '0.2', '0.4', '0.6')`,
			);
			await db.execute(
				`INSERT INTO task_strategy_fabric (id, task_id, risk_tier)
			 VALUES ('tsf-au3-proj', 'task-au3-proj', 'medium')`,
			);

			const knowledgeProjection = await getKnowledgeProjection(db, "ki-au3-proj");
			expect(knowledgeProjection).toMatchObject({
				id: "ksf-au3-proj",
				knowledgeItemId: "ki-au3-proj",
				layer: "L3",
				kind: "pattern",
			});
			const taskSignal = await getTaskPlanningSignal(db, "task-au3-proj");
			expect(taskSignal).toMatchObject({
				id: "tsf-au3-proj",
				taskId: "task-au3-proj",
				riskTier: "medium",
			});

			await upsertKnowledgeProjection(db, "ki-au3-proj", { layer: "L4", kind: "decision" });
			await upsertTaskPlanningSignal(db, "task-au3-proj", { riskTier: "high" });

			const [storedKnowledge] = await db
				.select()
				.from(knowledgeAppProjection)
				.where(eq(knowledgeAppProjection.knowledgeItemId, "ki-au3-proj"));
			const [storedTask] = await db
				.select()
				.from(taskPlanningSignals)
				.where(eq(taskPlanningSignals.taskId, "task-au3-proj"));
			expect(storedKnowledge).toMatchObject({ id: "ksf-au3-proj", layer: "L4", kind: "decision" });
			expect(storedTask).toMatchObject({ id: "tsf-au3-proj", riskTier: "high" });
		},
	);
});
