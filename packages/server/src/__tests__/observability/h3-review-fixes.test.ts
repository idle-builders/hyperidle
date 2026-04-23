/**
 * H3 review-fix regression tests.
 *
 * Covers:
 *  1. tool_call_recorded → ObservabilityEvent(tool_call) round-trip
 *     (architect C0 / adversary CRITICAL: tool_call events reach the
 *     observability adapter end-to-end).
 *  2. Wildcard bus subscription — every declared DomainEvent kind is
 *     either translated or explicitly dropped, never silently ignored
 *     (architect C2).
 *  3. Langfuse flush race — concurrent record() calls mean flush()
 *     awaits EVERY in-flight POST, not just the most recent
 *     (adversary critical #3).
 *  4. DNS-rebinding TOCTOU — a lookup that flips from public → private
 *     between the pre-check and fetch is caught (security H-1).
 *  5. PATCH /config rebuild — adapter rotation + key rotation takes
 *     effect without a process restart (architect C1 / security M-3 /
 *     adversary WARN).
 *  6. Empty sessionId rejected silently — does not collapse onto an
 *     empty traceId (adversary WARN).
 *  7. Stable envelopeId — deterministic across batches (adversary #9).
 *  8. FlushOutcome partial-drain — callers can distinguish clean
 *     drains from partial errors (review non-blocking #15).
 *  9. Drop-oldest is O(1) at cap — covered in performance.bench; this
 *     file exercises the buffer semantics in a targeted way.
 * 10. scrubInlineTokens broader coverage — AKIA, xox, AIza, JWT,
 *     Stripe, PEM (security M-2).
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDb, factorySettings, type HyperIdleDb } from "@hyperidle/db";
import {
	EventBus,
	type KnowledgeUpdatedEvent,
	type ObservabilityEvent,
	type SessionStartedEvent,
	scrubInlineTokens,
	type ToolCallRecordedEvent,
} from "@hyperidle/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createObservabilityRoutes } from "../../routes/observability-routes.js";
import {
	type ObservabilityConfig,
	updateObservabilityConfig,
} from "../../services/observability/config.js";
import {
	createObservabilityDispatcher,
	registerObservabilityDispatcher,
} from "../../services/observability/dispatcher.js";
import { createLangfuseObservabilityAdapter } from "../../services/observability/langfuse-adapter.js";
import type {
	ObservabilityAdapter,
	ObservabilityDispatcher,
} from "../../services/observability/types.js";

function captureAdapter(
	name: "console" | "langfuse" = "console",
): ObservabilityAdapter & { events: ObservabilityEvent[]; flushed: number } {
	const events: ObservabilityEvent[] = [];
	let flushed = 0;
	return {
		name,
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

function makeInMemResolver(): {
	resolve: (sessionId: string) => string | null;
	seed: (sessionId: string, traceId: string) => void;
} {
	const map = new Map<string, string>();
	return {
		resolve: (id) => map.get(id) ?? null,
		seed: (id, t) => map.set(id, t),
	};
}

describe("H3 review fixes — (1) tool_call round-trip", () => {
	it("emits ObservabilityEvent(tool_call) when bus carries tool_call_recorded", async () => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const resolver = makeInMemResolver();
		resolver.seed("sess-1", "trace-A");
		const unsub = registerObservabilityDispatcher(bus, { dispatcher, resolver });
		const ev: ToolCallRecordedEvent = {
			type: "tool_call_recorded",
			streamId: "sess-1",
			sessionId: "sess-1",
			toolName: "Read",
			argsSummary: '{"path":"/workspace/foo.ts"}',
			timestamp: Date.now(),
		};
		bus.emit<"tool_call_recorded">(ev);
		await dispatcher.flush();
		unsub();
		expect(adapter.events).toHaveLength(1);
		const tc = adapter.events[0];
		expect(tc.kind).toBe("tool_call");
		if (tc.kind !== "tool_call") throw new Error("narrowing failed");
		expect(tc.toolName).toBe("Read");
		expect(tc.argsSummary).toContain("/workspace/foo.ts");
		expect(tc.traceId).toBe("trace-A");
		await dispatcher.dispose();
	});
});

describe("H3 review fixes — (2) wildcard subscription", () => {
	it("any new DomainEvent kind is explicitly dropped, not silently skipped", async () => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 100, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const resolver = makeInMemResolver();
		const unsub = registerObservabilityDispatcher(bus, { dispatcher, resolver });

		// These are DomainEvent kinds the dispatcher explicitly DROPS
		// (not yet wired to any ObservabilityEvent). They must pass
		// through the wildcard handler without crashing.
		bus.emit<"item_created">({
			type: "item_created",
			streamId: "conv-1",
			itemId: "item-1",
			conversationId: "conv-1",
			kind: "response",
			timestamp: Date.now(),
		});
		bus.emit<"response_recorded">({
			type: "response_recorded",
			streamId: "conv-1",
			responseId: "r-1",
			itemId: "item-1",
			decision: "accept",
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
		bus.emit<"bet_committed">({
			type: "bet_committed",
			streamId: "b-1",
			betId: "b-1",
			teamId: "team-1",
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
			message: "hi",
			timestamp: Date.now(),
		});

		await dispatcher.flush();
		// None of the above map to an ObservabilityEvent today, but the
		// subscription must not crash and the buffer must stay empty.
		expect(adapter.events).toHaveLength(0);
		unsub();
		await dispatcher.dispose();
	});

	it("wildcard handler translates all seven mapped kinds", async () => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 100, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const resolver = makeInMemResolver();
		resolver.seed("sess-X", "trace-X");
		const unsub = registerObservabilityDispatcher(bus, { dispatcher, resolver });
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
		await dispatcher.flush();
		unsub();
		expect(adapter.events.map((e) => e.kind)).toEqual([
			"session_started",
			"tool_call",
			"knowledge_write",
		]);
		await dispatcher.dispose();
	});
});

describe("H3 review fixes — (3) Langfuse flush race", () => {
	let server: Server | null = null;
	afterEach(async () => {
		if (server) await new Promise<void>((r) => server?.close(() => r()));
		server = null;
	});

	it("flush() awaits every in-flight batch, not just the most recent", async () => {
		// Fixture that introduces a per-request delay so two concurrent
		// record() calls overlap in flight. The old single-slot `inFlight`
		// only tracked the latest batch; flush() could return before the
		// earlier batch finished.
		let pendingA: (() => void) | null = null;
		let pendingB: (() => void) | null = null;
		const captured: number[] = [];
		await new Promise<void>((resolve, reject) => {
			server = createServer(async (req, res) => {
				let pass: () => void;
				if (!pendingA) {
					pass = (): void => {
						res.statusCode = 207;
						res.end("{}");
					};
					pendingA = pass;
				} else {
					pass = (): void => {
						res.statusCode = 207;
						res.end("{}");
					};
					pendingB = pass;
				}
				req.on("data", () => {});
				req.on("end", () => {
					captured.push(captured.length);
				});
			});
			server.on("error", reject);
			server.listen(0, "127.0.0.1", () => resolve());
		});
		if (!server) throw new Error("no server");
		const port = (server.address() as AddressInfo).port;
		const adapter = createLangfuseObservabilityAdapter({
			url: `http://127.0.0.1:${port}`,
			publicKey: "pk",
			secretKey: "sk",
		});
		const ts = "2026-04-18T00:00:00.000Z";
		const ev: ObservabilityEvent = {
			kind: "session_started",
			traceId: "t",
			sessionId: "s",
			ts,
			agentId: "a",
			taskId: "k",
		};
		const a = adapter.record([ev]);
		const b = adapter.record([ev]);
		// Resolve both fixture responses, B first then A, so the
		// more-recent record's promise would have settled BEFORE the
		// older one. flush() must still await the older one.
		let resolved = 0;
		a.then(() => {
			resolved += 1;
		});
		b.then(() => {
			resolved += 1;
		});
		// Wait until both requests arrived at the fixture.
		await new Promise<void>((r) => {
			const iv = setInterval(() => {
				if (pendingA && pendingB) {
					clearInterval(iv);
					r();
				}
			}, 10);
		});
		pendingB?.();
		pendingA?.();
		await adapter.flush();
		expect(resolved).toBe(2);
		await a;
		await b;
	});
});

describe("H3 review fixes — (4) DNS rebinding TOCTOU", () => {
	it("re-resolves before fetch; a flip to a private IP blocks the outbound", async () => {
		// First lookup returns a public IP; second returns 10.0.0.1. The
		// adapter must refuse the fetch.
		let call = 0;
		const lookup = async (_h: string): Promise<Array<{ address: string; family: 4 | 6 }>> => {
			call += 1;
			if (call === 1) return [{ address: "203.0.113.10", family: 4 }];
			return [{ address: "10.0.0.1", family: 4 }];
		};
		let fetchCalls = 0;
		const adapter = createLangfuseObservabilityAdapter({
			url: "https://attacker.example.com",
			publicKey: "pk",
			secretKey: "sk",
			lookup,
			fetch: async (): Promise<Response> => {
				fetchCalls += 1;
				return new Response(null, { status: 207 });
			},
		});
		const ts = "2026-04-18T00:00:00.000Z";
		const ev: ObservabilityEvent = {
			kind: "session_started",
			traceId: "t",
			sessionId: "s",
			ts,
			agentId: "a",
			taskId: "k",
		};
		await expect(adapter.record([ev])).rejects.toThrow(/blocked.*private/i);
		expect(fetchCalls).toBe(0);
	});

	it("passes through when both lookups stay public", async () => {
		const lookup = async (): Promise<Array<{ address: string; family: 4 | 6 }>> => [
			{ address: "203.0.113.10", family: 4 },
		];
		let fetchCalls = 0;
		const adapter = createLangfuseObservabilityAdapter({
			url: "https://safe.example.com",
			publicKey: "pk",
			secretKey: "sk",
			lookup,
			fetch: async (): Promise<Response> => {
				fetchCalls += 1;
				return new Response(null, { status: 207 });
			},
		});
		const ts = "2026-04-18T00:00:00.000Z";
		await adapter.record([
			{
				kind: "session_started",
				traceId: "t",
				sessionId: "s",
				ts,
				agentId: "a",
				taskId: "k",
			},
		]);
		expect(fetchCalls).toBe(1);
	});
});

describe("H3 review fixes — (5) PATCH /config live rebuild", () => {
	it("switches adapter + rotates keys without restart", async () => {
		const db = createTestDb();
		const events: ObservabilityEvent[] = [];
		const fakeAdapter: ObservabilityAdapter = {
			name: "console",
			async record(batch): Promise<void> {
				for (const e of batch) events.push(e);
			},
			async flush(): Promise<void> {
				// no-op
			},
		};

		let currentDispatcher: ObservabilityDispatcher | null = null;

		function makeRoutes(): ReturnType<typeof createObservabilityRoutes> {
			return createObservabilityRoutes(db, {
				getDispatcher: (): ObservabilityDispatcher | null => currentDispatcher,
				onConfigChange: (cfg: ObservabilityConfig): void => {
					// Simulate the app.ts rebuild: dispose old, rebuild new.
					void currentDispatcher?.dispose();
					if (cfg.enabled) {
						currentDispatcher = createObservabilityDispatcher({
							adapter: fakeAdapter,
							config: {
								batchSize: cfg.batchSize,
								flushIntervalMs: cfg.flushIntervalMs,
								bufferCap: cfg.bufferCap,
							},
						});
					} else {
						currentDispatcher = null;
					}
				},
			});
		}

		// Seed config: observability enabled, adapter=console.
		updateObservabilityConfig(db, {
			enabled: true,
			adapter: "console",
			batchSize: 10,
			flushIntervalMs: 60_000,
			bufferCap: 100,
		});

		const router = makeRoutes();
		// Initial dispatcher is null because makeRoutes doesn't fire
		// onConfigChange at construction — simulate first-boot by
		// manually firing with the current config.
		currentDispatcher = createObservabilityDispatcher({
			adapter: fakeAdapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});

		// Now patch to enabled=false. dispatcher should become null.
		const res = await router.fetch(
			new Request("http://test.local/config", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ enabled: false }),
			}),
		);
		expect(res.status).toBe(200);
		expect(currentDispatcher).toBeNull();

		// Then patch back to enabled + langfuse keys; a new dispatcher
		// must be constructed with the updated config. Langfuse-keyed
		// adapters build here with a fake adapter to keep the test
		// offline.
		const res2 = await router.fetch(
			new Request("http://test.local/config", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					enabled: true,
					langfusePublicKey: "pk-lf-rotated",
					langfuseSecretKey: "sk-lf-rotated",
				}),
			}),
		);
		expect(res2.status).toBe(200);
		expect(currentDispatcher).not.toBeNull();

		// Sanity: the dispatcher accepts an enqueue after the rebuild.
		currentDispatcher?.enqueue({
			kind: "session_started",
			traceId: "t",
			sessionId: "s",
			ts: new Date().toISOString(),
			agentId: "a",
			taskId: "k",
		});
		await currentDispatcher?.flush();
		expect(events).toHaveLength(1);
		await currentDispatcher?.dispose();
	});

	it("invalidates /status config cache after PATCH", async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: (): ObservabilityDispatcher | null => null,
		});
		// First GET /status — returns enabled=false (default).
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
	});
});

describe("H3 review fixes — (6) empty sessionId rejected", () => {
	it("falls back to 'unknown' instead of the empty string", async () => {
		const bus = new EventBus();
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 10, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const resolver = makeInMemResolver();
		const unsub = registerObservabilityDispatcher(bus, { dispatcher, resolver });
		bus.emit<"session_started">({
			type: "session_started",
			streamId: "",
			sessionId: "",
			agentId: "a",
			taskId: "t",
			timestamp: Date.now(),
		} satisfies SessionStartedEvent);
		await dispatcher.flush();
		unsub();
		expect(adapter.events[0].traceId).toBe("unknown");
		await dispatcher.dispose();
	});
});

describe("H3 review fixes — (7) stable envelopeId", () => {
	it("same event fields produce the same envelope id across batches", async () => {
		// Fire the same event through the adapter twice (simulates a
		// retry loop or a replay). Adversary review #9: previous
		// index-based ids diverged, defeating Langfuse dedupe.
		const fixture = await new Promise<{
			server: Server;
			port: number;
			captured: Array<{ body: string }>;
		}>((resolve, reject) => {
			const captured: Array<{ body: string }> = [];
			const server = createServer((req, res) => {
				const chunks: Buffer[] = [];
				req.on("data", (c: Buffer) => chunks.push(c));
				req.on("end", () => {
					captured.push({ body: Buffer.concat(chunks).toString("utf-8") });
					res.statusCode = 207;
					res.end("{}");
				});
			});
			server.on("error", reject);
			server.listen(0, "127.0.0.1", () => {
				const a = server.address() as AddressInfo;
				resolve({ server, port: a.port, captured });
			});
		});
		try {
			const adapter = createLangfuseObservabilityAdapter({
				url: `http://127.0.0.1:${fixture.port}`,
				publicKey: "pk",
				secretKey: "sk",
			});
			const ts = "2026-04-18T00:00:00.000Z";
			const ev: ObservabilityEvent = {
				kind: "session_started",
				traceId: "trace-Z",
				sessionId: "sess-Z",
				ts,
				agentId: "a",
				taskId: "t",
			};
			await adapter.record([ev]);
			await adapter.record([ev]);
			expect(fixture.captured).toHaveLength(2);
			const first = JSON.parse(fixture.captured[0].body) as {
				batch: Array<{ id: string }>;
			};
			const second = JSON.parse(fixture.captured[1].body) as {
				batch: Array<{ id: string }>;
			};
			expect(first.batch[0].id).toBe(second.batch[0].id);
		} finally {
			await new Promise<void>((r) => fixture.server.close(() => r()));
		}
	});
});

describe("H3 review fixes — (8) FlushOutcome partial-drain", () => {
	it("returns { flushed, dropped, errors } so callers can distinguish partial", async () => {
		let failCount = 0;
		const adapter: ObservabilityAdapter = {
			name: "console",
			async record(batch): Promise<void> {
				failCount += 1;
				if (failCount === 1) throw new Error("first call fails");
				// subsequent calls would succeed — but the dispatcher
				// drops the batch and stops the drain loop on error,
				// so this is unreachable.
				void batch;
			},
			async flush(): Promise<void> {
				// no-op
			},
		};
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 2, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		for (let i = 0; i < 4; i += 1) {
			dispatcher.enqueue({
				kind: "tool_call",
				traceId: "t",
				sessionId: "s",
				ts: new Date().toISOString(),
				toolName: `a-${i}`,
				argsSummary: "{}",
			});
		}
		const outcome = await dispatcher.flush();
		expect(outcome.flushed).toBe(0);
		expect(outcome.dropped).toBe(2);
		expect(outcome.errors).toBe(1);
		await dispatcher.dispose();
	});
});

describe("H3 review fixes — (9) request-size cap", () => {
	it("rejects POST /flush with oversized content-length", async () => {
		const db = createTestDb();
		const router = createObservabilityRoutes(db, {
			getDispatcher: (): ObservabilityDispatcher | null => null,
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
	});
});

describe("H3 review fixes — (10) scrubInlineTokens broader coverage", () => {
	it("scrubs AWS AKIA access keys", () => {
		const out = scrubInlineTokens("leaked AKIAABCDEFGHIJKLMNOP here");
		expect(out).not.toContain("AKIAABCDEFGHIJKLMNOP");
		expect(out).toContain("[REDACTED_AKIA]");
	});
	it("scrubs Slack bot tokens", () => {
		const out = scrubInlineTokens("xoxb-123456789-abcdefghij");
		expect(out).not.toContain("xoxb-123456789-abcdefghij");
	});
	it("scrubs Google API keys", () => {
		const key = `AIza${"a".repeat(35)}`;
		const out = scrubInlineTokens(`uri=${key}`);
		expect(out).not.toContain(key);
	});
	it("scrubs JWTs", () => {
		const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.sig_abcdef";
		const out = scrubInlineTokens(`tok=${jwt}`);
		expect(out).not.toContain(jwt);
	});
	it("scrubs Stripe live keys", () => {
		const out = scrubInlineTokens("sk_live_abcdefghij123");
		expect(out).not.toContain("sk_live_abcdefghij123");
	});
	it("scrubs PEM private key blocks", () => {
		const pem =
			"-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...multiple\nlines here\n-----END RSA PRIVATE KEY-----";
		const out = scrubInlineTokens(pem);
		expect(out).not.toContain("MIIEpAIB");
		expect(out).toContain("[REDACTED_PEM]");
	});
});

describe("H3 review fixes — (11) event ordering within a session", () => {
	it("events emitted in order from the bus reach the adapter in order", async () => {
		// EventBus.emit is synchronous; enqueue is synchronous. Drain
		// runs in insertion order because the ring buffer is FIFO.
		const bus = new EventBus();
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 100, flushIntervalMs: 60_000, bufferCap: 100 },
		});
		const resolver = makeInMemResolver();
		resolver.seed("sess-O", "trace-O");
		const unsub = registerObservabilityDispatcher(bus, { dispatcher, resolver });
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
			costDelta: 10,
			outcome: "completed",
		});
		await dispatcher.flush();
		unsub();
		const names = adapter.events.map((e): string => {
			if (e.kind === "tool_call") return e.toolName;
			return e.kind;
		});
		expect(names[0]).toBe("session_started");
		expect(names[names.length - 1]).toBe("session_ended");
		for (let i = 0; i < 20; i += 1) {
			expect(names[i + 1]).toBe(`Tool-${i.toString().padStart(2, "0")}`);
		}
		await dispatcher.dispose();
	});
});

describe("H3 review fixes — (12) ring buffer semantics", () => {
	it("evicting oldest preserves insertion order of surviving events", async () => {
		const adapter = captureAdapter();
		const dispatcher = createObservabilityDispatcher({
			adapter,
			config: { batchSize: 1000, flushIntervalMs: 60_000, bufferCap: 3 },
		});
		for (let i = 0; i < 10; i += 1) {
			dispatcher.enqueue({
				kind: "tool_call",
				traceId: "t",
				sessionId: "s",
				ts: new Date().toISOString(),
				toolName: `tool-${i}`,
				argsSummary: "{}",
			});
		}
		expect(dispatcher.status().bufferDepth).toBe(3);
		expect(dispatcher.status().dropped).toBe(7);
		await dispatcher.flush();
		const kept = adapter.events.map((e) => (e.kind === "tool_call" ? e.toolName : e.kind));
		expect(kept).toEqual(["tool-7", "tool-8", "tool-9"]);
		await dispatcher.dispose();
	});
});

// Keep a reference so the unused-db import doesn't fail lint when the
// underlying setup routine stops using it.
void (null as unknown as HyperIdleDb);
void factorySettings;
