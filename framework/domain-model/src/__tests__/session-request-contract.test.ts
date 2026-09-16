import { describe, expect, test } from "vitest";
import {
	type AgentSessionRequestInput,
	agentSessionRequestInputSchema,
	type SessionLifecycleCorrelation,
} from "../session-request.js";

describe("agent session request contract", () => {
	test("accepts every current LLM-capable source kind with required correlation", () => {
		const examples: AgentSessionRequestInput[] = [
			{
				sourceKind: "task",
				sourceId: "task-1",
				streamId: "task:task-1",
				taskId: "task-1",
				agentId: "agent-1",
				teamId: "team-1",
				promptMode: "task",
				idempotencyKey: "task:task-1:accepted",
				sourceCorrelation: { taskId: "task-1", teamId: "team-1" },
			},
			{
				sourceKind: "assistant",
				sourceId: "msg-1",
				streamId: "thread:thread-1",
				agentId: "assistant-1",
				userId: "user-1",
				promptMode: "conversation",
				idempotencyKey: "assistant:msg-1",
				sourceCorrelation: {
					threadId: "thread-1",
					messageId: "msg-1",
					userId: "user-1",
					assistantAgentId: "assistant-1",
				},
			},
			{
				sourceKind: "routine",
				sourceId: "run-1",
				streamId: "routine:routine-1",
				agentId: "agent-1",
				teamId: "team-1",
				promptMode: "routine",
				idempotencyKey: "routine:run-1",
				sourceCorrelation: { routineId: "routine-1", routineRunId: "run-1", teamId: "team-1" },
			},
			{
				sourceKind: "knowledge",
				sourceId: "ki-1:review",
				streamId: "knowledge:ki-1",
				agentId: "agent-1",
				teamId: "team-1",
				promptMode: "knowledge",
				idempotencyKey: "knowledge:ki-1:review",
				sourceCorrelation: { knowledgeItemId: "ki-1", action: "review", teamId: "team-1" },
			},
		];

		for (const example of examples) {
			expect(agentSessionRequestInputSchema.parse(example)).toMatchObject({
				sourceKind: example.sourceKind,
				sourceId: example.sourceId,
			});
		}
	});

	test("rejects missing source-specific correlation instead of accepting optional-field bags", () => {
		expect(() =>
			agentSessionRequestInputSchema.parse({
				sourceKind: "assistant",
				sourceId: "msg-1",
				streamId: "thread:thread-1",
				agentId: "assistant-1",
				promptMode: "conversation",
				idempotencyKey: "assistant:msg-1",
				sourceCorrelation: { threadId: "thread-1", messageId: "msg-1" },
			}),
		).toThrow();
	});

	test("lifecycle events carry request/source correlation and taskId is optional", () => {
		const correlation: SessionLifecycleCorrelation = {
			requestId: "req-1",
			sourceKind: "assistant",
			sourceId: "msg-1",
			sourceCorrelation: {
				threadId: "thread-1",
				messageId: "msg-1",
				userId: "user-1",
				assistantAgentId: "assistant-1",
			},
		};
		const started = {
			type: "session_started",
			streamId: "thread:thread-1",
			sessionId: "session-1",
			agentId: "assistant-1",
			taskId: null,
			timestamp: Date.now(),
			...correlation,
		};
		const ended = {
			type: "session_ended",
			streamId: "thread:thread-1",
			sessionId: "session-1",
			agentId: "assistant-1",
			taskId: null,
			timestamp: Date.now(),
			outcome: "completed",
			...correlation,
		};

		expect(started.requestId).toBe("req-1");
		expect(ended.sourceKind).toBe("assistant");
		expect(ended.taskId).toBeNull();
	});
});
