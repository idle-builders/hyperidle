/**
 * X8: Read inbox scenarios (interaction 8).
 *
 * Tests the read_inbox tool: check and respond, empty inbox, multi-thread filtering.
 */

import { messages } from "@hyperidle/db";
import { and, eq, ne } from "drizzle-orm";
import {
	judgeLlmQuality,
	judgeNoHarmfulActions,
	judgeSendMessageCalled,
	judgeSessionCompleted,
} from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedMessage, seedMinimalWorld, seedMultiAgentWorld, seedThread } from "../seeding.js";
import type {
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// ri-check-and-respond-pm-consulting
// ---------------------------------------------------------------------------

const riCheckAndRespondPmConsulting: EvalScenario = {
	id: "ri-check-and-respond-pm-consulting",
	description: "PM checks inbox, finds pending question, and responds via send_message",
	feature: "read_inbox",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager coordinating a consulting engagement.
At the start of each session, check your inbox using read_inbox to see if teammates have questions.
If you find a question, respond to it using send_message. Always address what was asked.`,
			secondAgentRole: "builder",
			secondAgentName: "Builder Agent",
			taskTitle: "Coordinate client engagement kickoff",
			taskDescription: `Start your session by checking your inbox with read_inbox.
You have received a question from a builder teammate about the project timeline.
Read the message and send a response using send_message.
Your response should directly address the timeline question asked.`,
			betDescription: "Client engagement coordination",
			betDoneCondition: "Kickoff coordination documented.",
		});
		// Seed a thread with the builder's question for the PM
		const { threadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.secondAgentId,
			participants: [world.secondAgentId, world.agentId],
		});

		await seedMessage(ctx.db, {
			senderId: world.secondAgentId,
			threadId,
			payload: JSON.stringify({
				text: "Hi, I need clarity on the project timeline. When is the client kickoff meeting scheduled, and what deliverables are due in the first two weeks?",
			}),
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
			judgeSendMessageCalled(),
			judgeLlmQuality({
				id: "message_quality",
				label: "Response Addresses Timeline Question",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const sentMessages = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));
					return sentMessages.map((m: { payload: string }) => m.payload).join("\n");
				},
				criteria: `Score 1.0 if the PM's response addresses the builder's question about the project timeline (mentions meeting schedule, deliverables, or specific timeframes). Score 0.5 if the response is sent but does not directly address the timeline question. Score 0.0 if no response was sent.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// ri-empty-inbox-builder-devops
// ---------------------------------------------------------------------------

const riEmptyInboxBuilderDevops: EvalScenario = {
	id: "ri-empty-inbox-builder-devops",
	description: "Builder checks empty inbox and continues work without errors",
	feature: "read_inbox",
	tags: ["quick"],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		return await seedMinimalWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on infrastructure tasks.
At the start of each session, check your inbox using read_inbox.
If the inbox is empty, proceed with your assigned task.
Never create items or tasks when there are no messages requiring action.`,
			taskTitle: "Review and optimize database query performance",
			taskDescription: `Start by checking your inbox with read_inbox.
If there are no messages, proceed to document your query optimization approach in session notes.
Do NOT create any tasks or items if the inbox is empty — just do your assigned work.`,
			betDescription: "Database performance optimization",
			betDoneCondition: "Query performance documented and optimized.",
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
				id: "no_spurious_messages",
				label: "No Spurious Messages Sent (Empty Inbox Handled Gracefully)",
				judge: async (ctx: JudgeContext) => {
					const sentMessages = await ctx.db
						.select({ id: messages.id })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));
					const noMessages = sentMessages.length === 0;
					return {
						score: noMessages ? 1.0 : 0.5,
						note: noMessages
							? undefined
							: `Agent sent ${sentMessages.length} messages on empty inbox (may indicate confusion)`,
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// ri-multiple-threads-builder-frontend
// ---------------------------------------------------------------------------

let riMultiThreadCorrectThreadId = "";

const riMultipleThreadsBuilderFrontend: EvalScenario = {
	id: "ri-multiple-threads-builder-frontend",
	description: "Builder checks inbox with multiple threads and responds to the relevant one",
	feature: "read_inbox",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent implementing frontend components.
Check your inbox using read_inbox when you start your session.
When you find messages, prioritize the one directly related to your current task.
Respond using send_message to the sender who asked about your current task.`,
			secondAgentRole: "product_manager",
			secondAgentName: "PM Agent",
			taskTitle: "Implement dark mode toggle for dashboard",
			taskDescription: `Check your inbox first. You will find messages from multiple sources.
Focus on the message about the dark mode implementation — a PM has asked about your progress.
Respond to that specific question using send_message.
Ignore unrelated threads (e.g., general team updates).`,
			betDescription: "Dashboard UI improvements",
			betDoneCondition: "Dark mode toggle implemented.",
		});
		// Thread 1 (relevant): PM asking about dark mode progress
		const { threadId: relevantThreadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.secondAgentId,
			participants: [world.secondAgentId, world.agentId],
		});
		riMultiThreadCorrectThreadId = relevantThreadId;

		await seedMessage(ctx.db, {
			senderId: world.secondAgentId,
			threadId: relevantThreadId,
			payload: JSON.stringify({
				text: "Hi, can you give me an update on the dark mode toggle? Is the CSS variable approach working?",
			}),
		});

		// Thread 2 (irrelevant): general team update thread
		const { threadId: irrelevantThreadId } = await seedThread(ctx.db, {
			hostKind: "task",
			hostId: world.taskId,
			initiatorId: world.secondAgentId,
			participants: [world.secondAgentId, world.agentId],
		});

		await seedMessage(ctx.db, {
			senderId: world.secondAgentId,
			threadId: irrelevantThreadId,
			payload: JSON.stringify({
				text: "Team standup reminder: don't forget to update your tickets before end of day.",
			}),
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
			judgeSendMessageCalled(),
			{
				id: "correct_thread_responded",
				label: "Response in Relevant Thread or to Correct Sender",
				judge: async (ctx: JudgeContext) => {
					const sentMessages = await ctx.db
						.select({ threadId: messages.threadId, payload: messages.payload })
						.from(messages)
						.where(
							and(
								eq(messages.senderId, ctx.seedResult.agentId),
								ne(messages.threadId, riMultiThreadCorrectThreadId),
							),
						);

					// Check if agent responded in the correct thread
					const inCorrectThread = await ctx.db
						.select({ id: messages.id })
						.from(messages)
						.where(
							and(
								eq(messages.senderId, ctx.seedResult.agentId),
								eq(messages.threadId, riMultiThreadCorrectThreadId),
							),
						);

					if (inCorrectThread.length > 0) {
						return { score: 1.0, note: "Responded in the correct thread" };
					}

					// Partial credit if they sent a message at all (may have used send_message directly)
					const allSentMessages = await ctx.db
						.select({ id: messages.id })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));

					if (allSentMessages.length > 0) {
						return {
							score: 0.5,
							note: `Sent message but not in the correct thread (${sentMessages.length} in wrong thread)`,
						};
					}

					return { score: 0.0, note: "No response message found" };
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const readInboxScenarios: EvalScenario[] = [
	riCheckAndRespondPmConsulting,
	riEmptyInboxBuilderDevops,
	riMultipleThreadsBuilderFrontend,
];
