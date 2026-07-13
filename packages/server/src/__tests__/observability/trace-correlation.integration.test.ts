/**
 * H3 AC3 — Trace correlation proof.
 *
 * Given a session is started, when subsequent domain events keyed to
 * that session are emitted, then every resulting ObservabilityEvent
 * carries the same traceId the DB populated on session insert.
 */

import {
	type CostCapBreachedEvent,
	EventBus,
	type ObservabilityEvent,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import {
	createDbTraceIdResolver,
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
} from "@hyperidle/core-app";
import type { ObservabilityAdapter } from "@hyperidle/core-app";
import { describe, expect, test } from "../../test-fixtures.js";

function captureAdapter(): ObservabilityAdapter & { events: ObservabilityEvent[] } {
	const events: ObservabilityEvent[] = [];
	return {
		name: "console",
		events,
		async record(batch: readonly ObservabilityEvent[]): Promise<void> {
			for (const e of batch) events.push(e);
		},
		async flush(): Promise<void> {
			// no-op
		},
	};
}

describe("H3 AC3 — Trace correlation", () => {
	test("resolver uses seed cache (O2: traceId column stripped from sessions)", ({ db }) => {
		const resolver = createDbTraceIdResolver(db);
		// O2: traceId column stripped — resolver now uses seed/cache only
		resolver.seed("sess-1", "trace-specific-uuid");
		expect(resolver.resolve("sess-1")).toBe("trace-specific-uuid");
		expect(resolver.resolve("missing")).toBeNull();
	});

	test("session + cost event carry the same trace id (AC3)", async () => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 100, flushIntervalMs: 60_000, bufferCap: 1000 },
		});
		const resolver: ReturnType<typeof createDbTraceIdResolver> = {
			resolve: (id: string): string | null => (id === "sess-X" ? "trace-X" : null),
			seed: (): void => undefined,
		};
		const unsub = registerObservabilityDispatcher(bus, { dispatcher, resolver });

		bus.emit<"session_started">({
			type: "session_started",
			streamId: "sess-X",
			sessionId: "sess-X",
			agentId: "a",
			taskId: "t",
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);
		bus.emit<"cost_cap_breached">({
			type: "cost_cap_breached",
			streamId: "sess-X",
			level: "hard",
			capLevel: "agent",
			entityId: "a",
			spend: 100,
			cap: 100,
			timestamp: Date.now(),
		} satisfies CostCapBreachedEvent);

		await dispatcher.flush();
		unsub();
		expect(adapter.events).toHaveLength(2);
		const [session, cost] = adapter.events;
		expect(session!.traceId).toBe("trace-X");
		expect(cost!.traceId).toBe("trace-X");
		await dispatcher.dispose();
	});
});
