import type { Span } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _setTracerProviderForTesting, getTracer, HYPERIDLE } from "../otel.js";
import { handleSystemMessage, inferSkillNameForTesting } from "../runner.js";

type SystemMessage = Parameters<typeof handleSystemMessage>[2];

const STORY_ID = "L99";
const TASK_ID = "task-1";

function makeStarted(description: string, taskType?: string): SystemMessage {
	return {
		type: "system",
		subtype: "task_started",
		task_id: TASK_ID,
		description,
		task_type: taskType,
		uuid: "u-1",
		session_id: "s-1",
	} as SystemMessage;
}

function makeNotification(
	status: "completed" | "failed" | "stopped",
	usage?: { total_tokens: number; tool_uses: number; duration_ms: number },
): SystemMessage {
	return {
		type: "system",
		subtype: "task_notification",
		task_id: TASK_ID,
		status,
		output_file: "/tmp/x",
		summary: "done",
		usage,
		uuid: "u-2",
		session_id: "s-1",
	} as SystemMessage;
}

describe("inferSkillName", () => {
	it("extracts from a slash-prefixed token", () => {
		expect(inferSkillNameForTesting("/concept hello")).toBe("concept");
		expect(inferSkillNameForTesting("running /architecture-review now")).toBe(
			"architecture-review",
		);
	});

	it("falls back to the leading word", () => {
		expect(inferSkillNameForTesting("design variant exploration")).toBe("design");
		expect(inferSkillNameForTesting("write-tests phase")).toBe("write-tests");
	});

	it("returns undefined for empty or non-matching input", () => {
		expect(inferSkillNameForTesting(undefined)).toBeUndefined();
		expect(inferSkillNameForTesting("")).toBeUndefined();
		expect(inferSkillNameForTesting("UPPERCASE FIRST")).toBeUndefined();
	});
});

describe("handleSystemMessage emits OTel spans", () => {
	let exporter: InMemorySpanExporter;
	let teardown: () => Promise<void>;

	beforeEach(() => {
		exporter = new InMemorySpanExporter();
		teardown = _setTracerProviderForTesting([new SimpleSpanProcessor(exporter)]);
	});

	afterEach(async () => {
		await teardown();
	});

	it("opens a span on task_started and closes it on task_notification", () => {
		const taskSpans = new Map<string, Span>();
		handleSystemMessage("g", STORY_ID, makeStarted("/concept L10"), taskSpans);
		expect(taskSpans.size).toBe(1);
		expect(exporter.getFinishedSpans()).toHaveLength(0);

		handleSystemMessage(
			"g",
			STORY_ID,
			makeNotification("completed", {
				total_tokens: 1234,
				tool_uses: 22,
				duration_ms: 5000,
			}),
			taskSpans,
		);
		expect(taskSpans.size).toBe(0);

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		const attrs = spans[0].attributes;
		expect(attrs[HYPERIDLE.storyId]).toBe(STORY_ID);
		expect(attrs[HYPERIDLE.persona]).toBe("concept");
		expect(attrs[HYPERIDLE.totalTokens]).toBe(1234);
		expect(attrs[HYPERIDLE.toolCallsActual]).toBe(22);
		expect(attrs[HYPERIDLE.durationMs]).toBe(5000);
		// Frontmatter-derived: concept's min_tool_calls is set in the shipped SKILL.md.
		expect(attrs[HYPERIDLE.toolCallsMinimumEstimate]).toBeTypeOf("number");
		expect(attrs[HYPERIDLE.toolCallsMinimumEstimate]).toBeGreaterThan(0);
	});

	it("marks the span ERROR when the task fails", () => {
		const taskSpans = new Map<string, Span>();
		handleSystemMessage("g", STORY_ID, makeStarted("design phase"), taskSpans);
		handleSystemMessage("g", STORY_ID, makeNotification("failed"), taskSpans);
		const span = exporter.getFinishedSpans()[0];
		expect(span.status.code).toBe(2);
	});

	it("ignores task_notification with no matching open span", () => {
		const taskSpans = new Map<string, Span>();
		handleSystemMessage("g", STORY_ID, makeNotification("completed"), taskSpans);
		expect(exporter.getFinishedSpans()).toHaveLength(0);
	});

	it("survives a task_started whose description has no recognizable skill", () => {
		const taskSpans = new Map<string, Span>();
		handleSystemMessage("g", STORY_ID, makeStarted("UNRECOGNIZED"), taskSpans);
		handleSystemMessage("g", STORY_ID, makeNotification("completed"), taskSpans);
		const attrs = exporter.getFinishedSpans()[0].attributes;
		expect(attrs[HYPERIDLE.taskDescription]).toBe("UNRECOGNIZED");
		// No matching frontmatter, so the estimate is absent.
		expect(HYPERIDLE.toolCallsMinimumEstimate in attrs).toBe(false);
	});
});

describe("getTracer", () => {
	it("returns a tracer that does not throw", () => {
		const span = getTracer().startSpan("noop");
		span.end();
		expect(span).toBeDefined();
	});
});
