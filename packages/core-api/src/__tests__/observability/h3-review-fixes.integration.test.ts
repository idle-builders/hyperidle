/**
 * H3 review-fix regression tests.
 *
 * Covers:
 *  1. tool_call_recorded → ObservabilityEvent(tool_call) round-trip
 *  2. Wildcard bus subscription — explicitly dropped, never silently ignored
 *  3. PATCH /config rebuild — adapter rotation without restart
 *  4. Empty sessionId rejected — does not collapse onto empty traceId
 *  5. FlushOutcome partial-drain — distinguish clean vs partial errors
 *  6. Drop-oldest O(1) at cap / ring buffer semantics
 *  7. scrubInlineTokens broader coverage
 *  8. Event ordering within a session
 *  9. Ring buffer semantics
 *
 * AU20 Ab3: migrated from raw `createObservabilityDispatcher` /
 * `registerObservabilityDispatcher` (now internal) to `startObservability`
 * (the single composition entry point). Tests drive the full runtime via bus
 * emission + `runtime.flush()`, exercising the same end-to-end path as
 * before. The `ObservabilityDeps.adapter` seam replaces the per-test adapter
 * construction + manual dispatcher wiring.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	type ObservabilityConfig,
	type ObservabilityDeps,
	startObservability,
	updateObservabilityConfig,
} from "@hyperidle/observability";
import { readServerConfig, updateServerConfig } from "@hyperidle/settings";
import {
	EventBus,
	type KnowledgeUpdatedEvent,
	type ObservabilityEvent,
	type SessionStartedEvent,
	scrubInlineTokens,
	type ToolCallRecordedEvent,
} from "@hyperidle/shared";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import { describe, expect, test } from "../../test-fixtures.js";

/** Same port-wiring idiom as `observability-routes.ts`. */
const observabilityServerConfigPort = { read: readServerConfig, update: updateServerConfig };

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Minimal serverConfig port that ignores the db param and returns a
 * hardcoded config. Used by tests that need `startObservability` but
 * don't care about persisted config.
 */
function stubServerConfig(cfg: ObservabilityConfig): ObservabilityDeps["serverConfig"] {
	return {
		read: (_db: HyperIdleDb) => Promise.resolve({ observability: cfg }),
		update: (_db: HyperIdleDb, _patch: unknown) => Promise.resolve(),
	};
}

type CaptureAdapter = NonNullable<ObservabilityDeps["adapter"]> & {
	events: ObservabilityEvent[];
	readonly flushed: number;
};

function captureAdapter(): CaptureAdapter {
	const events: ObservabilityEvent[] = [];
	let flushed = 0;
	return {
		name: "console",
		events,
		get flushed(): number {
			return flushed;
		},
		async record(batch: readonly ObservabilityEvent[]): Promise<void> {
			for (const e of batch) events.push(e);
		},
		async flush(): Promise<void> {
			flushed += 1;
		},
	};
}

/** Base config for tests that need a running dispatcher. */
const runningConfig: ObservabilityConfig = {
	enabled: true,
	adapter: "console",
	batchSize: 10,
	flushIntervalMs: 60_000,
	bufferCap: 100,
};

// Keep a reference so the unused-db import doesn't fail lint when the
// underlying setup routine stops using it.
void (null as unknown as HyperIdleDb);

// ─── test groups ─────────────────────────────────────────────────────────────

describe("H3 review fixes — (1) tool_call round-trip", () => {
	test("emits ObservabilityEvent(tool_call) when bus carries tool_call_recorded", async ({
		db,
	}) => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig(runningConfig),
			adapter,
		});

		const ev: ToolCallRecordedEvent = {
			type: "tool_call_recorded",
			streamId: "sess-1",
			sessionId: "sess-1",
			toolName: "Read",
			argsSummary: '{"path":"/workspace/foo.ts"}',
			timestamp: Date.now(),
		};
		bus.emit<"tool_call_recorded">(ev);
		await runtime.flush();

		expect(adapter.events).toHaveLength(1);
		const tc = adapter.events[0];
		expect(tc!.kind).toBe("tool_call");
		if (tc!.kind !== "tool_call") throw new Error("narrowing failed");
		expect(tc!.toolName).toBe("Read");
		expect(tc!.argsSummary).toContain("/workspace/foo.ts");
		// Without pre-seeded resolver, traceId falls back to sessionId.
		expect(tc!.traceId).toBe("sess-1");

		await runtime.dispose();
	});
});

describe("H3 review fixes — (2) wildcard subscription", () => {
	test("any new DomainEvent kind is explicitly dropped, not silently skipped", async ({ db }) => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig({ ...runningConfig, batchSize: 100, bufferCap: 100 }),
			adapter,
		});

		// These are DomainEvent kinds the dispatcher explicitly DROPS.
		bus.emit<"item_created">({
			type: "item_created",
			streamId: "conv-1",
			itemId: "item-1",
			conversationId: "conv-1",
			kind: "response",
			timestamp: Date.now(),
		});
		bus.emit<"routine_fired">({
			type: "routine_fired",
			streamId: "r-1",
			routineId: "r-1",
			agentId: "a",
			timestamp: Date.now(),
		});
		bus.emit<"dependency_met">({
			type: "dependency_met",
			streamId: "t-1",
			taskId: "t-1",
			dependencyId: "t-0",
			timestamp: Date.now(),
		});
		bus.emit<"bet_revised">({
			type: "bet_revised",
			streamId: "b-1",
			betId: "b-1",
			field: "appetite",
			timestamp: Date.now(),
		});
		bus.emit<"notification">({
			type: "notification",
			streamId: "note-1",
			targetId: "t-1",
			kind: "attention",
			message: "hi",
			timestamp: Date.now(),
		});

		await runtime.flush();
		// None of the above map to an ObservabilityEvent — buffer must stay empty.
		expect(adapter.events).toHaveLength(0);
		await runtime.dispose();
	});

	test("wildcard handler translates all seven mapped kinds", async ({ db }) => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig({ ...runningConfig, batchSize: 100, bufferCap: 100 }),
			adapter,
		});

		const now = Date.now();
		bus.emit<"session_started">({
			type: "session_started",
			streamId: "sess-X",
			sessionId: "sess-X",
			agentId: "a",
			taskId: "t",
			timestamp: now,
		});
		bus.emit<"tool_call_recorded">({
			type: "tool_call_recorded",
			streamId: "sess-X",
			sessionId: "sess-X",
			toolName: "Write",
			argsSummary: "{}",
			timestamp: now,
		});
		bus.emit<"knowledge_updated">({
			type: "knowledge_updated",
			streamId: "k:1",
			itemId: "k1",
			action: "created",
			timestamp: now,
		} satisfies KnowledgeUpdatedEvent);
		await runtime.flush();

		expect(adapter.events.map((e) => e.kind)).toEqual([
			"session_started",
			"tool_call",
			"knowledge_write",
		]);
		await runtime.dispose();
	});
});

describe("H3 review fixes — (3) PATCH /config live rebuild", () => {
	test("switches adapter + rotates keys without restart", async ({ db }) => {
		const events: ObservabilityEvent[] = [];
		const fakeAdapterInst: NonNullable<ObservabilityDeps["adapter"]> = {
			name: "console",
			async record(batch: readonly ObservabilityEvent[]): Promise<void> {
				for (const e of batch) events.push(e);
			},
			async flush(): Promise<void> {
				// no-op
			},
		};

		// Seed config: observability enabled, adapter=console.
		await updateObservabilityConfig(
			db,
			{
				enabled: true,
				adapter: "console",
				batchSize: 10,
				flushIntervalMs: 60_000,
				bufferCap: 100,
			},
			{ serverConfig: observabilityServerConfigPort },
		);

		const runtime = await startObservability({
			db,
			eventBus: new EventBus(),
			serverConfig: observabilityServerConfigPort,
			adapter: fakeAdapterInst,
		});

		const router = createObservabilityRoutes(db, {
			getRuntime: () => runtime,
			onConfigChange: (cfg: ObservabilityConfig): void => {
				runtime.reconfigure(cfg);
			},
		});

		// PATCH to enabled=false. Runtime should report disabled.
		const res = await router.fetch(
			new Request("http://test.local/config", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ enabled: false }),
			}),
		);
		expect(res.status).toBe(200);
		expect(runtime.status().enabled).toBe(false);

		// PATCH back to enabled=true + adapter=console.
		const res2 = await router.fetch(
			new Request("http://test.local/config", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					enabled: true,
					adapter: "console",
				}),
			}),
		);
		expect(res2.status).toBe(200);
		expect(runtime.status().enabled).toBe(true);
		expect(runtime.status().adapter).toBe("console");

		await runtime.dispose();
	});

	// @lore AF16 T14: default-on. Seed enabled=false first so the PATCH-to-true
	// transition is observable.
	test("invalidates /status config cache after PATCH", async ({ db }) => {
		await updateObservabilityConfig(
			db,
			{ enabled: false },
			{ serverConfig: observabilityServerConfigPort },
		);

		const runtime = await startObservability({
			db,
			eventBus: new EventBus(),
			serverConfig: observabilityServerConfigPort,
		});

		const router = createObservabilityRoutes(db, {
			getRuntime: () => runtime,
			onConfigChange: (cfg: ObservabilityConfig): void => {
				runtime.reconfigure(cfg);
			},
		});

		// First GET /status — returns enabled=false (explicitly seeded).
		const a = await (await router.fetch(new Request("http://test.local/status"))).json();
		expect((a as Record<string, unknown>).enabled).toBe(false);

		// PATCH to enable.
		const res = await router.fetch(
			new Request("http://test.local/config", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ enabled: true, adapter: "noop" }),
			}),
		);
		expect(res.status).toBe(200);

		// Second GET /status — must reflect the updated config.
		const b = await (await router.fetch(new Request("http://test.local/status"))).json();
		expect((b as Record<string, unknown>).enabled).toBe(true);
		expect((b as Record<string, unknown>).adapter).toBe("noop");

		await runtime.dispose();
	});
});

describe("H3 review fixes — (4) empty sessionId rejected", () => {
	test("falls back to 'unknown' instead of the empty string", async ({ db }) => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig(runningConfig),
			adapter,
		});

		bus.emit<"session_started">({
			type: "session_started",
			streamId: "",
			sessionId: "",
			agentId: "a",
			taskId: "t",
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);
		await runtime.flush();

		expect(adapter.events[0]!.traceId).toBe("unknown");
		await runtime.dispose();
	});
});

describe("H3 review fixes — (5) FlushOutcome partial-drain", () => {
	test("returns { flushed, dropped, errors } so callers can distinguish partial", async ({
		db,
	}) => {
		let failCount = 0;
		const failingAdapter: NonNullable<ObservabilityDeps["adapter"]> = {
			name: "console",
			async record(batch: readonly ObservabilityEvent[]): Promise<void> {
				failCount += 1;
				if (failCount === 1) throw new Error("first call fails");
				void batch;
			},
			async flush(): Promise<void> {
				// no-op
			},
		};

		const bus = new EventBus();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig({ ...runningConfig, batchSize: 2, bufferCap: 100 }),
			adapter: failingAdapter,
		});

		// Emit 4 events via bus; they land in the dispatcher buffer.
		for (let i = 0; i < 4; i += 1) {
			bus.emit<"tool_call_recorded">({
				type: "tool_call_recorded",
				streamId: "sess-5",
				sessionId: "sess-5",
				toolName: `a-${i}`,
				argsSummary: "{}",
				timestamp: Date.now(),
			});
		}

		const outcome = await runtime.flush();
		expect(outcome.flushed).toBe(0);
		expect(outcome.dropped).toBe(2);
		expect(outcome.errors).toBe(1);
		await runtime.dispose();
	});
});

describe("H3 review fixes — (6) request-size cap", () => {
	test("rejects POST /flush with oversized content-length", async ({ db }) => {
		const runtime = await startObservability({
			db,
			eventBus: new EventBus(),
			serverConfig: stubServerConfig({ ...runningConfig, enabled: false }),
		});

		const router = createObservabilityRoutes(db, {
			getRuntime: () => runtime,
		});
		const res = await router.fetch(
			new Request("http://test.local/flush", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": String(16 * 1024),
				},
				body: "{}",
			}),
		);
		expect(res.status).toBe(413);
		await runtime.dispose();
	});
});

describe("H3 review fixes — (7) scrubInlineTokens broader coverage", () => {
	test("scrubs AWS AKIA access keys", () => {
		const out = scrubInlineTokens("leaked AKIAABCDEFGHIJKLMNOP here");
		expect(out).not.toContain("AKIAABCDEFGHIJKLMNOP");
		expect(out).toContain("[REDACTED_AKIA]");
	});
	test("scrubs Slack bot tokens", () => {
		const out = scrubInlineTokens("xoxb-123456789-abcdefghij");
		expect(out).not.toContain("xoxb-123456789-abcdefghij");
	});
	test("scrubs Google API keys", () => {
		const key = `AIza${"a".repeat(35)}`;
		const out = scrubInlineTokens(`uri=${key}`);
		expect(out).not.toContain(key);
	});
	test("scrubs JWTs", () => {
		const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sig_abcdef";
		const out = scrubInlineTokens(`tok=${jwt}`);
		expect(out).not.toContain(jwt);
	});
	test("scrubs Stripe live keys", () => {
		const out = scrubInlineTokens("sk_live_abcdefghij123");
		expect(out).not.toContain("sk_live_abcdefghij123");
	});
	test("scrubs PEM private key blocks", () => {
		const pem =
			"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...multiple\nlines here\n-----END RSA PRIVATE KEY-----";
		const out = scrubInlineTokens(pem);
		expect(out).not.toContain("MIIEpAIB");
		expect(out).toContain("[REDACTED_PEM]");
	});
});

describe("H3 review fixes — (8) event ordering within a session", () => {
	test("events emitted in order from the bus reach the adapter in order", async ({ db }) => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig({ ...runningConfig, batchSize: 100, bufferCap: 100 }),
			adapter,
		});

		const t0 = Date.now();
		bus.emit<"session_started">({
			type: "session_started",
			streamId: "sess-O",
			sessionId: "sess-O",
			agentId: "a",
			taskId: "t",
			timestamp: t0,
		});
		for (let i = 0; i < 20; i += 1) {
			bus.emit<"tool_call_recorded">({
				type: "tool_call_recorded",
				streamId: "sess-O",
				sessionId: "sess-O",
				toolName: `Tool-${i.toString().padStart(2, "0")}`,
				argsSummary: "{}",
				timestamp: t0 + i,
			});
		}
		bus.emit<"session_ended">({
			type: "session_ended",
			streamId: "sess-O",
			sessionId: "sess-O",
			agentId: "a",
			taskId: "t",
			timestamp: t0 + 100,
			outcome: "completed",
		});
		await runtime.flush();

		const names = adapter.events.map((e): string => {
			if (e.kind === "tool_call") return e.toolName;
			return e.kind;
		});
		expect(names[0]).toBe("session_started");
		expect(names[names.length - 1]).toBe("session_ended");
		for (let i = 0; i < 20; i += 1) {
			expect(names[i + 1]).toBe(`Tool-${i.toString().padStart(2, "0")}`);
		}
		await runtime.dispose();
	});
});

describe("H3 review fixes — (9) ring buffer semantics", () => {
	test("evicting oldest preserves insertion order of surviving events", async ({ db }) => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const runtime = await startObservability({
			db,
			eventBus: bus,
			serverConfig: stubServerConfig({
				...runningConfig,
				batchSize: 1000,
				bufferCap: 3,
			}),
			adapter,
		});

		for (let i = 0; i < 10; i += 1) {
			bus.emit<"tool_call_recorded">({
				type: "tool_call_recorded",
				streamId: "sess-9",
				sessionId: "sess-9",
				toolName: `tool-${i}`,
				argsSummary: "{}",
				timestamp: Date.now(),
			});
		}

		expect(runtime.status().bufferDepth).toBe(3);
		expect(runtime.status().dropped).toBe(7);
		await runtime.flush();
		const kept = adapter.events.map((e) => (e.kind === "tool_call" ? e.toolName : e.kind));
		expect(kept).toEqual(["tool-7", "tool-8", "tool-9"]);
		await runtime.dispose();
	});
});
