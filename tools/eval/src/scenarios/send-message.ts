/**
 * X8: Send message scenarios (interaction 9).
 *
 * Tests the send_message tool: PM coordination, builder communication, thread reuse.
 */

import { messages, threads } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import { judgeLlmQuality, judgeSendMessageCalled, judgeSessionCompleted } from "../judges.js";
import { runEvalSession } from "../provision-harness.js";
import { seedMultiAgentWorld, seedThread } from "../seeding.js";
import type {
	EvalScenario,
	JudgeContext,
	ScenarioSeedResult,
	SeedContext,
	TriggerContext,
	TriggerResult,
} from "../types.js";

// ---------------------------------------------------------------------------
// sm-coordination-pm-frontend
// ---------------------------------------------------------------------------

let smCoordinationSecondAgentId = "";

const smCoordinationPmFrontend: EvalScenario = {
	id: "sm-coordination-pm-frontend",
	description: "PM sends coordination message to builder with task priorities",
	feature: "send_message",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "product_manager",
			agentSystemPrompt: `You are a product manager coordinating frontend development.
When you need to assign or prioritize work for a builder teammate, use send_message.
Your messages should clearly communicate priorities and any relevant constraints.`,
			secondAgentRole: "builder",
			secondAgentName: "Frontend Builder",
			taskTitle: "Coordinate frontend accessibility improvements",
			taskDescription: `Your task is to communicate priorities to the frontend builder on your team.

Send a message to the builder (agentId is in your context) with:
- The priority order for accessibility improvements
- The most critical item: fix keyboard navigation in the dropdown component (blocking users)
- The next priority: add ARIA labels to all form inputs
- Deadline context: accessibility audit is in 2 weeks

Use send_message with the builder's agentId as the recipient.`,
			betDescription: "Frontend accessibility compliance",
			betDoneCondition: "Accessibility improvements delivered before audit.",
		});
		smCoordinationSecondAgentId = world.secondAgentId;
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
				id: "recipient_correct",
				label: "Message Sent to Builder (Correct Recipient)",
				judge: async (ctx: JudgeContext) => {
					// Find any message sent by the PM
					const sentMessages = await ctx.db
						.select({ threadId: messages.threadId })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));

					if (sentMessages.length === 0) {
						return { score: 0.0, note: "No message sent" };
					}

					const firstMessage = sentMessages[0];
					if (!firstMessage) {
						return { score: 0.0, note: "No message sent" };
					}

					// Check if the thread includes the secondary agent
					const threadWithBuilder = await ctx.db
						.select({ participants: threads.participants })
						.from(threads)
						.where(eq(threads.id, firstMessage.threadId))
						.limit(1);

					if (!threadWithBuilder[0]) {
						return { score: 0.5, note: "Message sent but thread not found" };
					}

					try {
						const parts = JSON.parse(threadWithBuilder[0].participants) as string[];
						const builderIncluded = parts.includes(smCoordinationSecondAgentId);
						return {
							score: builderIncluded ? 1.0 : 0.5,
							note: builderIncluded
								? undefined
								: "Message thread does not include the builder agent",
						};
					} catch {
						return { score: 0.5, note: "Could not parse thread participants" };
					}
				},
			},
			judgeLlmQuality({
				id: "message_quality",
				label: "Message Conveys Priority Information",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const sentMessages = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));
					return sentMessages.map((m: { payload: string }) => m.payload).join("\n");
				},
				criteria: `Score 1.0 if the message clearly communicates task priorities to the builder (mentions keyboard navigation as highest priority, ARIA labels as next, and some reference to the deadline or audit). Score 0.5 if the message mentions priorities but omits key details. Score 0.0 if the message is generic or missing priority information.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// sm-handoff-context-builder-devops
// ---------------------------------------------------------------------------

const smHandoffContextBuilderDevops: EvalScenario = {
	id: "sm-handoff-context-builder-devops",
	description: "Builder sends findings summary to teammate before handoff",
	feature: "send_message",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on infrastructure.
When you complete an investigation or reach a stopping point, proactively share your findings with your team.
Use send_message to summarize what you found, what decisions you made, and what work remains.
This context helps teammates who pick up your work.`,
			secondAgentRole: "builder",
			secondAgentName: "On-call Builder",
			taskTitle: "Investigate and document database connection pool exhaustion",
			taskDescription: `Investigate the database connection pool exhaustion issue and share your findings.

Your investigation reveals:
1. Root cause: connection pool size is set to 5 (too small for traffic)
2. Fix applied: increased pool size to 20 in configuration
3. Remaining work: monitoring dashboard not yet updated to track pool metrics

After your investigation, use send_message to share these findings with your teammate (the on-call builder).
Your message should summarize: root cause, fix applied, and what still needs to be done.`,
			betDescription: "Database reliability improvement",
			betDoneCondition: "Connection pool exhaustion resolved and monitored.",
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
				label: "Message Contains Handoff Context",
				extractContent: async (ctx: JudgeContext): Promise<string> => {
					const sentMessages = await ctx.db
						.select({ payload: messages.payload })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));
					return sentMessages.map((m: { payload: string }) => m.payload).join("\n");
				},
				criteria: `Score 1.0 if the message contains all three: (1) root cause or what was found, (2) what action was taken or fix applied, (3) what work remains. Score 0.5 if 2 of 3 are present. Score 0.0 if fewer than 2 are present or no message was sent.`,
			}),
		],
	},
};

// ---------------------------------------------------------------------------
// sm-thread-reuse-builder-consulting
// ---------------------------------------------------------------------------

let smThreadReuseExistingThreadId = "";

const smThreadReuseBuilderConsulting: EvalScenario = {
	id: "sm-thread-reuse-builder-consulting",
	description: "Builder reuses existing direct thread instead of creating a new one",
	feature: "send_message",
	tags: [],
	seed: async (ctx: SeedContext): Promise<ScenarioSeedResult> => {
		const world = await seedMultiAgentWorld(ctx.db, {
			agentRole: "builder",
			agentSystemPrompt: `You are a builder agent working on consulting deliverables.
When sending messages to teammates, the system automatically reuses existing direct threads.
Use send_message to communicate with your PM teammate about the deliverable status.`,
			secondAgentRole: "product_manager",
			secondAgentName: "PM Coordinator",
			taskTitle: "Update PM on deliverable status",
			taskDescription: `Send a status update to your PM teammate about the consulting deliverable.

Use send_message to tell the PM:
- The executive summary draft is 80% complete
- You need their review on the market analysis section by tomorrow
- The final deck will be ready for client review on Friday`,
			betDescription: "Client consulting deliverable",
			betDoneCondition: "Deliverable completed and client review scheduled.",
		});
		// Seed an existing direct thread between the two agents
		const { threadId } = await seedThread(ctx.db, {
			hostKind: "direct",
			hostId: `${world.agentId}:${world.secondAgentId}`,
			initiatorId: world.secondAgentId,
			participants: [world.agentId, world.secondAgentId],
		});
		smThreadReuseExistingThreadId = threadId;

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
				id: "thread_reused",
				label: "Existing Direct Thread Reused",
				judge: async (ctx: JudgeContext) => {
					const sentMessages = await ctx.db
						.select({ threadId: messages.threadId })
						.from(messages)
						.where(eq(messages.senderId, ctx.seedResult.agentId));

					if (sentMessages.length === 0) {
						return { score: 0.0, note: "No message sent" };
					}

					// Check if the message was sent in the pre-existing thread
					const inExistingThread = sentMessages.some(
						(m: { threadId: string | null }) => m.threadId === smThreadReuseExistingThreadId,
					);

					// Count total direct threads to see if a new one was created
					const directThreads = await ctx.db
						.select({ id: threads.id })
						.from(threads)
						.where(eq(threads.hostKind, "direct"));

					const newThreadCreated = directThreads.length > 1;

					if (inExistingThread && !newThreadCreated) {
						return { score: 1.0, note: "Existing thread reused correctly" };
					}
					if (inExistingThread) {
						return {
							score: 0.75,
							note: "Sent in existing thread but additional thread also created",
						};
					}
					if (!newThreadCreated && sentMessages.length > 0) {
						return { score: 0.5, note: "Message sent but not in the pre-seeded thread" };
					}
					return {
						score: 0.25,
						note: "New direct thread created instead of reusing existing one",
					};
				},
			},
		],
	},
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const sendMessageScenarios: EvalScenario[] = [
	smCoordinationPmFrontend,
	smHandoffContextBuilderDevops,
	smThreadReuseBuilderConsulting,
];
