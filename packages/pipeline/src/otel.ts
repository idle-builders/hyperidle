import { type Attributes, type Span, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
	BatchSpanProcessor,
	NodeTracerProvider,
	type SpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const TRACER_NAME = "hyperidle-pipeline";
const SERVICE_NAME = "hyperidle-pipeline";
const SERVICE_VERSION = "0.0.1";

// @lore Custom OTel attribute namespace per docs/observability plan
// (plans/token-efficiency-blocks.md Block 0). Wire format is OTel GenAI
// semantic conventions plus this hyperidle.* namespace, kept stable so the
// LangSmith dashboard survives any backend or harness swap.
export const HYPERIDLE = {
	storyId: "hyperidle.story.id",
	storyComplexity: "hyperidle.story.complexity",
	storyPattern: "hyperidle.story.pattern",
	persona: "hyperidle.persona",
	phase: "hyperidle.phase",
	iteration: "hyperidle.iteration",
	replanCount: "hyperidle.replan_count",
	toolCallsActual: "hyperidle.tool_calls.actual",
	toolCallsParallel: "hyperidle.tool_calls.parallel",
	toolCallsMinimumEstimate: "hyperidle.tool_calls.minimum_estimate",
	cacheHitRatio: "hyperidle.cache.hit_ratio",
	briefInjected: "hyperidle.brief.injected",
	taskDescription: "hyperidle.task.description",
	taskType: "hyperidle.task.type",
	taskWorkflow: "hyperidle.task.workflow",
	totalTokens: "hyperidle.tokens.total",
	durationMs: "hyperidle.duration_ms",
} as const;

let provider: NodeTracerProvider | null = null;

/**
 * Initialize OTel from environment variables. No-op if `OTEL_EXPORTER_OTLP_ENDPOINT`
 * is not set, so unconfigured environments incur zero overhead.
 *
 * Env vars (LangSmith example):
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://api.smith.langchain.com/otel
 *   OTEL_EXPORTER_OTLP_HEADERS=x-api-key=$LANGSMITH_API_KEY
 *   OTEL_RESOURCE_ATTRIBUTES=service.name=hyperidle-pipeline,deployment.environment=local
 */
export function initOtel(): void {
	if (provider) return;
	if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;

	const exporter = new OTLPTraceExporter();
	provider = new NodeTracerProvider({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: SERVICE_NAME,
			[ATTR_SERVICE_VERSION]: SERVICE_VERSION,
		}),
		spanProcessors: [new BatchSpanProcessor(exporter)],
	});
	provider.register();
}

export async function shutdownOtel(): Promise<void> {
	if (!provider) return;
	await provider.shutdown();
	provider = null;
}

/**
 * Test-only: register a custom tracer provider (e.g. with an in-memory exporter).
 * Returns a teardown function that restores the no-op provider.
 */
export function _setTracerProviderForTesting(processors: SpanProcessor[]): () => Promise<void> {
	trace.disable();
	if (provider) {
		void provider.shutdown();
		provider = null;
	}
	const testProvider = new NodeTracerProvider({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: SERVICE_NAME,
			[ATTR_SERVICE_VERSION]: SERVICE_VERSION,
		}),
		spanProcessors: processors,
	});
	testProvider.register();
	return async () => {
		await testProvider.shutdown();
		trace.disable();
	};
}

export function getTracer(): Tracer {
	return trace.getTracer(TRACER_NAME, SERVICE_VERSION);
}

export function setSpanAttributes(span: Span, attrs: Attributes): void {
	for (const [k, v] of Object.entries(attrs)) {
		if (v === undefined || v === null) continue;
		span.setAttribute(k, v);
	}
}

export function recordSpanError(span: Span, err: unknown): void {
	const message = err instanceof Error ? err.message : String(err);
	span.recordException(err instanceof Error ? err : new Error(message));
	span.setStatus({ code: SpanStatusCode.ERROR, message });
}
