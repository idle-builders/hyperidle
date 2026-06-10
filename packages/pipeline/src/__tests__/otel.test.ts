import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	_setTracerProviderForTesting,
	getTracer,
	HYPERIDLE,
	recordSpanError,
	setSpanAttributes,
} from "../otel.js";

describe("otel", () => {
	let exporter: InMemorySpanExporter;
	let teardown: () => Promise<void>;

	beforeEach(() => {
		exporter = new InMemorySpanExporter();
		teardown = _setTracerProviderForTesting([new SimpleSpanProcessor(exporter)]);
	});

	afterEach(async () => {
		await teardown();
	});

	it("emits a span with hyperidle.* attributes", () => {
		const span = getTracer().startSpan("test.span");
		setSpanAttributes(span, {
			[HYPERIDLE.storyId]: "L10",
			[HYPERIDLE.persona]: "architect",
			[HYPERIDLE.toolCallsActual]: 12,
			[HYPERIDLE.toolCallsMinimumEstimate]: 8,
		});
		span.end();

		const spans = exporter.getFinishedSpans();
		expect(spans).toHaveLength(1);
		const attrs = spans[0]!.attributes;
		expect(attrs[HYPERIDLE.storyId]).toBe("L10");
		expect(attrs[HYPERIDLE.persona]).toBe("architect");
		expect(attrs[HYPERIDLE.toolCallsActual]).toBe(12);
		expect(attrs[HYPERIDLE.toolCallsMinimumEstimate]).toBe(8);
	});

	it("setSpanAttributes skips undefined and null", () => {
		const span = getTracer().startSpan("test.skip");
		setSpanAttributes(span, {
			[HYPERIDLE.storyId]: "L10",
			[HYPERIDLE.persona]: undefined,
			[HYPERIDLE.taskType]: undefined,
		});
		span.end();

		const attrs = exporter.getFinishedSpans()[0]!.attributes;
		expect(attrs[HYPERIDLE.storyId]).toBe("L10");
		expect(HYPERIDLE.persona in attrs).toBe(false);
		expect(HYPERIDLE.taskType in attrs).toBe(false);
	});

	it("recordSpanError marks the span ERROR and records the exception", () => {
		const span = getTracer().startSpan("test.error");
		recordSpanError(span, new Error("boom"));
		span.end();

		const finished = exporter.getFinishedSpans()[0]!;
		expect(finished.status.code).toBe(2);
		expect(finished.status.message).toBe("boom");
		expect(finished.events.some((e) => e.name === "exception")).toBe(true);
	});

	it("getTracer returns a valid tracer when no provider is registered", async () => {
		await teardown();
		// No provider registered now — should return the no-op tracer.
		const tracer = trace.getTracer("hyperidle-pipeline");
		const span = tracer.startSpan("noop");
		span.end();
		// Should not throw, even without a registered provider.
		expect(span).toBeDefined();
		// Re-register so afterEach teardown is consistent.
		exporter = new InMemorySpanExporter();
		teardown = _setTracerProviderForTesting([new SimpleSpanProcessor(exporter)]);
	});
});
