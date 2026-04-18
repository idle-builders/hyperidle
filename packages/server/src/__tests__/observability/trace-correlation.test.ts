/**
 * H3 AC3 — Trace correlation proof.
 *
 * Given a session is started, when subsequent domain events keyed to
 * that session are emitted, then every resulting ObservabilityEvent
 * carries the same traceId the DB populated on session insert.
 */

import { agents, bets, createTestDb, products, sessions, tasks, teams } from "@hyperidle/db";
import {
	type CostCapBreachedEvent,
	EventBus,
	type ObservabilityEvent,
	type SessionStartedEvent,
} from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
	createDbTraceIdResolver,
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
} from "../../services/observability/dispatcher.js";
import type { ObservabilityAdapter } from "../../services/observability/types.js";

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
	it("DB resolver returns the sessions.trace_id column", () => {
		const db = createTestDb();
		const iso = new Date().toISOString();
		db.insert(products).values({ id: "p", name: "P", phase: "active", createdAt: iso }).run();
		db.insert(teams).values({ id: "team", productId: "p", capacity: 1, formedAt: iso }).run();
		db.insert(agents)
			.values({
				id: "agent-1",
				name: "A",
				role: "engineer",
				status: "idle",
				maxConcurrentSessions: 1,
				createdAt: iso,
			})
			.run();
		db.insert(bets)
			.values({
				id: "b",
				productId: "p",
				teamId: "team",
				pitch: "p",
				appetite: "week",
				status: "active",
				createdAt: iso,
			})
			.run();
		db.insert(tasks)
			.values({
				id: "t",
				betId: "b",
				productId: "p",
				teamId: "team",
				title: "T",
				state: "accepted",
				createdAt: iso,
				updatedAt: iso,
			})
			.run();
		db.insert(sessions)
			.values({
				id: "sess-1",
				taskId: "t",
				agentId: "agent-1",
				modelTier: "mid",
				startedAt: iso,
				state: "active",
				traceId: "trace-specific-uuid",
			})
			.run();

		const resolver = createDbTraceIdResolver(db);
		expect(resolver.resolve("sess-1")).toBe("trace-specific-uuid");
		expect(resolver.resolve("missing")).toBeNull();
		const row = db.select().from(sessions).where(eq(sessions.id, "sess-1")).get();
		expect(row?.traceId).toBe("trace-specific-uuid");
	});

	it("session + cost event carry the same trace id (AC3)", async () => {
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
		expect(session.traceId).toBe("trace-X");
		expect(cost.traceId).toBe("trace-X");
		await dispatcher.dispose();
	});
});
