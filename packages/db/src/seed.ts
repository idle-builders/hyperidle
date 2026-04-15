import crypto from "node:crypto";
import type { HyperIdleDb } from "./connection.js";
import {
	agentSkills,
	agents,
	bets,
	factorySettings,
	fileLeases,
	items,
	knowledgeEditLog,
	knowledgeItems,
	messages,
	products,
	responses,
	routines,
	sessions,
	tasks,
	teams,
	threads,
} from "./schema.js";

function uuid(): string {
	return crypto.randomUUID();
}

function now(): string {
	return new Date().toISOString();
}

export async function seed(db: HyperIdleDb): Promise<void> {
	const timestamp = now();

	// 1. products
	const productId = uuid();
	db.insert(products)
		.values({
			id: productId,
			name: "TaskFlow",
			phase: "building",
			briefPath: "/docs/taskflow/brief.md",
			architecturePath: "/docs/taskflow/architecture.md",
			brandPath: "/docs/taskflow/brand.md",
			principlesPath: "/docs/taskflow/principles.md",
			factoryDbPath: "/data/taskflow.db",
			createdAt: timestamp,
		})
		.run();

	// 2. factorySettings
	db.insert(factorySettings)
		.values({
			key: "global_cost_cap",
			value: "10000",
			updatedAt: timestamp,
		})
		.run();

	// 3. threads
	const threadId = uuid();
	db.insert(threads)
		.values({
			id: threadId,
			kind: "general",
			pinned: false,
			participants: JSON.stringify(["agent-1", "agent-2"]),
			createdAt: timestamp,
		})
		.run();

	// 4. agents
	const agentId1 = uuid();
	const agentId2 = uuid();
	db.insert(agents)
		.values([
			{
				id: agentId1,
				name: "Builder-1",
				soulPromptPath: "/souls/builder.md",
				role: "engineer",
				skills: JSON.stringify(["typescript", "react"]),
				status: "active",
				maxConcurrentSessions: 2,
				costCap: 500,
				costActual: 42.5,
				createdAt: timestamp,
			},
			{
				id: agentId2,
				name: "Reviewer-1",
				soulPromptPath: "/souls/reviewer.md",
				role: "reviewer",
				skills: JSON.stringify(["code-review", "security"]),
				status: "idle",
				maxConcurrentSessions: 1,
				costCap: 200,
				costActual: 10,
				createdAt: timestamp,
			},
		])
		.run();

	// 5. teams
	const teamId = uuid();
	db.insert(teams)
		.values({
			id: teamId,
			productId: productId,
			members: JSON.stringify([agentId1, agentId2]),
			leadAgentId: agentId1,
			capacity: 3,
			activeBets: 1,
			costCap: 1000,
			costActual: 52.5,
			formedAt: timestamp,
		})
		.run();

	// Update agents with teamId
	// (No FK so we can set it directly — but we do it via a simple update)
	const { eq } = await import("drizzle-orm");
	db.update(agents).set({ teamId: teamId }).where(eq(agents.id, agentId1)).run();
	db.update(agents).set({ teamId: teamId }).where(eq(agents.id, agentId2)).run();

	// 6. bets
	const betId = uuid();
	db.insert(bets)
		.values({
			id: betId,
			productId: productId,
			teamId: teamId,
			pitch: "Build a task management dashboard with drag-and-drop",
			appetite: "2 weeks",
			doneCondition: "Dashboard renders tasks with drag-and-drop reordering",
			hypothesis: "Users will organize tasks faster with visual drag-and-drop",
			status: "in_progress",
			revisionLog: JSON.stringify([]),
			createdAt: timestamp,
		})
		.run();

	// 7. tasks
	const taskId = uuid();
	db.insert(tasks)
		.values({
			id: taskId,
			betId: betId,
			productId: productId,
			teamId: teamId,
			ownerAgentId: agentId1,
			title: "Implement drag-and-drop component",
			description: "Build a React DnD component for task cards",
			doneCondition: "Component renders and supports reordering",
			state: "in_progress",
			dependencies: JSON.stringify([]),
			artifacts: JSON.stringify([]),
			costCap: 100,
			costActual: 15,
			durability: "durable",
			riskTier: "low",
			attentionScore: 0.8,
			crossTeam: false,
			threadId: threadId,
			notes: "Using react-dnd library",
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.run();

	// 8. sessions
	const sessionId = uuid();
	db.insert(sessions)
		.values({
			id: sessionId,
			taskId: taskId,
			agentId: agentId1,
			modelTier: "workhorse",
			startedAt: timestamp,
			state: "active",
			workspaceSnapshot: JSON.stringify({ branch: "feat/dnd", commit: "abc123" }),
			cost: 5.2,
			notes: "Working on initial implementation",
		})
		.run();

	// 9. routines
	const routineId = uuid();
	db.insert(routines)
		.values({
			id: routineId,
			ownerAgentId: agentId1,
			triggerType: "cron",
			triggerConfig: JSON.stringify({ schedule: "0 */6 * * *" }),
			skillId: "code-review",
			doneCondition: "All open PRs reviewed",
			stateKey: "review-routine-state",
			delegationAllowed: true,
			humanReview: false,
			autonomyLevel: "L2",
			silent: false,
			active: true,
		})
		.run();

	// 10. messages
	const messageId = uuid();
	db.insert(messages)
		.values({
			id: messageId,
			senderId: agentId1,
			recipientId: agentId2,
			threadId: threadId,
			subject: "PR ready for review",
			body: "The drag-and-drop component is ready for review. Please check.",
			fileLeases: JSON.stringify([]),
			createdAt: timestamp,
		})
		.run();

	// 11. items
	const itemId = uuid();
	db.insert(items)
		.values({
			id: itemId,
			sourceAgentId: agentId1,
			layer: "L1",
			verb: "propose",
			kind: "decision",
			title: "Use react-dnd for drag-and-drop",
			body: "Proposing react-dnd as the drag-and-drop library for the task dashboard.",
			attachments: JSON.stringify([]),
			proposedAction: "approve",
			options: JSON.stringify(["react-dnd", "dnd-kit", "custom"]),
			riskTier: "low",
			attentionScore: 0.5,
			blocking: false,
			reasoning: "react-dnd is mature and well-documented",
			costEstimate: 10,
			auditTrail: JSON.stringify([]),
			threadId: threadId,
			createdAt: timestamp,
		})
		.run();

	// 12. responses
	const responseId = uuid();
	db.insert(responses)
		.values({
			id: responseId,
			itemId: itemId,
			decision: "approved",
			feedback: "Good choice, proceed with react-dnd",
			approverId: agentId2,
			view: "summary",
			respondedAt: timestamp,
		})
		.run();

	// 13. agentSkills
	db.insert(agentSkills)
		.values({
			agentId: agentId1,
			skillId: "typescript",
			autonomyLevel: "L3",
			successCount: 42,
			failureCount: 3,
			lastUsedAt: timestamp,
		})
		.run();

	// 14. knowledgeItems
	const kiId = uuid();
	db.insert(knowledgeItems)
		.values({
			id: kiId,
			layer: "L1",
			scopeId: productId,
			kind: "pattern",
			topic: "drag-and-drop",
			title: "React DnD Integration Pattern",
			body: "Use react-dnd with HTML5 backend for task card reordering.",
			format: "markdown",
			status: "active",
			attentionScore: 0.7,
			confidence: 0.9,
			version: 1,
			updatedBy: agentId1,
			createdAt: timestamp,
			updatedAt: timestamp,
		})
		.run();

	// 15. knowledgeEditLog
	const kelId = uuid();
	db.insert(knowledgeEditLog)
		.values({
			id: kelId,
			itemId: kiId,
			editor: agentId1,
			field: "body",
			oldValue: null,
			newValue: "Use react-dnd with HTML5 backend for task card reordering.",
			editType: "correction",
			createdAt: timestamp,
		})
		.run();

	// 16. fileLeases
	const flId = uuid();
	db.insert(fileLeases)
		.values({
			id: flId,
			agentId: agentId1,
			filePath: "/src/components/TaskBoard.tsx",
			acquiredAt: timestamp,
		})
		.run();
}
