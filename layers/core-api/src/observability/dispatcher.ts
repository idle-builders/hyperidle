/**
 * Observability dispatcher — buffered, non-blocking, subscribe-once.
 *
 * Design rationale:
 *  - The event-bus hot path must remain synchronous + cheap. `enqueue`
 *    is therefore O(1) and never awaits.
 *  - Flush runs on a background interval. A batch-full condition fires
 *    an early flush via `queueMicrotask` to bound buffer growth during
 *    bursts.
 *  - Adapter failures are telemetry-only. Observability data is
 *    disposable by design; an adapter outage must never stall the
 *    factory.
 *  - We subscribe to the EventBus exactly once (wildcard). Per H3 plan
 *    §3.9, this replaces the alternative of wiring 30+ call sites.
 *    New DomainEvent kinds added to `shared/events.ts` pass through
 *    the wildcard handler and fall into the `default` branch (dropped
 *    explicitly, not silently). Adding a new observability mapping is
 *    a two-line change inside `translateDomainEvent`.
 *
 * @lore Ring-buffer uses a fixed-size array + head/tail cursors so
 * drop-oldest is O(1) amortised. The prior `splice/shift` approach was
 * O(n) per eviction and could pin the event loop for tens of ms during
 * bursts when the buffer stayed at cap (adversary review H3 #2).
 */

import {
	type BetStateChangedEvent,
	createLogger,
	type DomainEvent,
	type EventBus,
	type KnowledgeUpdatedEvent,
	type Logger,
	type ObservabilityEvent,
	type SessionEndedEvent,
	type SessionStartedEvent,
	type TaskStateChangedEvent,
	type ToolCallRecordedEvent,
} from "@hyperidle/shared";
import type {
	FlushOutcome,
	ObservabilityAdapter,
	ObservabilityChannel,
	ObservabilityDispatcher,
	ObservabilityDispatcherStatus,
} from "@hyperidle/shared/observability";

/**
 * The three ring-buffer knobs the dispatcher needs.
 *
 * @lore AU26 C2: this used to be `Pick<ObservabilityConfig, ...>`. The config
 * value now lives in `@hyperidle/settings` (it is a `server_config` section),
 * and `@hyperidle/shared` may not import a Service — so the dispatcher states
 * its own requirement structurally. `ObservabilityConfig` satisfies it.
 */
export interface DispatcherRingConfig {
	readonly batchSize: number;
	readonly flushIntervalMs: number;
	readonly bufferCap: number;
}

export interface DispatcherDeps {
	readonly adapter: ObservabilityAdapter;
	readonly config: DispatcherRingConfig;
	readonly now?: () => Date;
	readonly logger?: Logger;
	/** Override the setInterval used for the background timer (tests). */
	readonly setInterval?: (cb: () => void, ms: number) => ReturnType<typeof setInterval>;
	readonly clearInterval?: (h: ReturnType<typeof setInterval>) => void;
}

/**
 * Fixed-capacity ring buffer. `push` overwrites the oldest slot when
 * full; `drain(n)` pops the oldest n events in insertion order. All
 * operations are O(1) amortised — the array is allocated once at
 * construction and never resized.
 */
interface RingBuffer<T> {
	push(item: T): boolean;
	drain(n: number): T[];
	readonly length: number;
	readonly capacity: number;
}

function createRingBuffer<T>(capacity: number): RingBuffer<T> {
	// Array is allocated once; slots set to `undefined` when popped so
	// the GC can reclaim any references. Capacity cannot shrink.
	const slots: Array<T | undefined> = new Array<T | undefined>(capacity);
	let head = 0; // read cursor
	let tail = 0; // write cursor
	let size = 0;
	return {
		get length(): number {
			return size;
		},
		get capacity(): number {
			return capacity;
		},
		push(item: T): boolean {
			let evicted = false;
			if (size === capacity) {
				// Full — advance head (drop oldest) before overwriting.
				slots[head] = undefined;
				head = (head + 1) % capacity;
				size -= 1;
				evicted = true;
			}
			slots[tail] = item;
			tail = (tail + 1) % capacity;
			size += 1;
			return evicted;
		},
		drain(n: number): T[] {
			const take = Math.min(n, size);
			const out: T[] = [];
			for (let i = 0; i < take; i += 1) {
				const item = slots[head] as T;
				slots[head] = undefined;
				head = (head + 1) % capacity;
				out.push(item);
			}
			size -= take;
			return out;
		},
	};
}

interface DispatcherState {
	buffer: RingBuffer<ObservabilityEvent>;
	dropped: number;
	delivered: number;
	lastFlushAt: string | null;
	lastErrorAt: string | null;
	lastError: string | null;
	/** Rejects new enqueues when true; still drains on the way out. */
	accepting: boolean;
	/** Fully torn down when true; drain() refuses to run. */
	disposed: boolean;
	flushing: boolean;
	timer: ReturnType<typeof setInterval> | null;
}

/**
 * @lore AU26 C2: `TraceIdResolver` + `createDbTraceIdResolver` are DELETED.
 * The `sessions.traceId` column was stripped in O2, after which the "DB"
 * resolver was a bare in-memory cache that only `seed()` could ever fill —
 * and `seed()` had ZERO non-test callers repo-wide. So in production
 * `resolve()` always returned null and every traceId was already the
 * fallback below. The resolver was dead machinery kept alive by its own
 * tests; removing it changes no observable behaviour.
 */

export function createObservabilityDispatcher(deps: DispatcherDeps): ObservabilityDispatcher {
	const logger = deps.logger ?? createLogger({ pkg: "observability.dispatcher" });
	const nowFn = deps.now ?? ((): Date => new Date());
	// @lore AF4/§4g: the global `setInterval` overload set resolves to
	// `number | NodeJS.Timeout` under this lib config; pin the return to the
	// node `Timeout` the state field (and clearInterval) expect. Behaviour-neutral.
	const setIntervalFn: (cb: () => void, ms: number) => ReturnType<typeof setInterval> =
		deps.setInterval ?? setInterval;
	const clearIntervalFn = deps.clearInterval ?? clearInterval;

	const state: DispatcherState = {
		buffer: createRingBuffer<ObservabilityEvent>(deps.config.bufferCap),
		dropped: 0,
		delivered: 0,
		lastFlushAt: null,
		lastErrorAt: null,
		lastError: null,
		accepting: true,
		disposed: false,
		flushing: false,
		timer: null,
	};

	async function drain(): Promise<FlushOutcome> {
		const outcome = { flushed: 0, dropped: 0, errors: 0 };
		if (state.disposed) return outcome;
		if (state.flushing) return outcome;
		if (state.buffer.length === 0) return outcome;
		state.flushing = true;
		try {
			while (state.buffer.length > 0) {
				const batch = state.buffer.drain(deps.config.batchSize);
				try {
					await deps.adapter.record(batch);
					state.delivered += batch.length;
					outcome.flushed += batch.length;
					state.lastFlushAt = nowFn().toISOString();
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					state.lastError = message;
					state.lastErrorAt = nowFn().toISOString();
					// @lore Drop the batch on failure — observability is
					// disposable. Count the loss via `dropped` so operators
					// can see adapter health in /status.
					state.dropped += batch.length;
					outcome.dropped += batch.length;
					outcome.errors += 1;
					logger.warn("adapter record failed; dropping batch", {
						error: message,
						batchSize: batch.length,
					});
					break;
				}
			}
		} finally {
			state.flushing = false;
		}
		return outcome;
	}

	function maybeFlushSoon(): void {
		if (state.disposed) return;
		if (state.buffer.length < deps.config.batchSize) return;
		// @lore Don't await — enqueue must remain non-blocking.
		queueMicrotask(() => {
			void drain();
		});
	}

	function enqueue(event: ObservabilityEvent): void {
		if (!state.accepting) return;
		// Ring buffer returns `true` when the oldest entry was evicted.
		// Drop-oldest is O(1) — the head cursor advances and the new event
		// overwrites a stable slot.
		if (state.buffer.push(event)) {
			state.dropped += 1;
		}
		maybeFlushSoon();
	}

	function status(): ObservabilityDispatcherStatus {
		return {
			bufferDepth: state.buffer.length,
			lastFlushAt: state.lastFlushAt,
			lastErrorAt: state.lastErrorAt,
			lastError: state.lastError,
			dropped: state.dropped,
			delivered: state.delivered,
			adapter: deps.adapter.name as ObservabilityChannel,
		};
	}

	state.timer = setIntervalFn(() => {
		void drain();
	}, deps.config.flushIntervalMs);
	// @lore `unref` is a Node/Bun extension missing in browser-ish test
	// runtimes; without it the interval keeps the process alive in CLI
	// contexts. NodeJS.Timeout (the type of ReturnType<typeof setInterval>
	// in a Node context) already declares `.unref()` — no cast needed.
	if (typeof state.timer?.unref === "function") state.timer.unref();

	async function flush(): Promise<FlushOutcome> {
		const outcome = await drain();
		await deps.adapter.flush();
		return outcome;
	}

	async function dispose(): Promise<void> {
		// Reject further enqueues; the final drain still runs below.
		state.accepting = false;
		if (state.timer) {
			clearIntervalFn(state.timer);
			state.timer = null;
		}
		await drain();
		await deps.adapter.flush();
		state.disposed = true;
	}

	return {
		enqueue,
		flush,
		dispose,
		status,
	};
}

// ---------------------------------------------------------------------------
// Bus subscriber — translates DomainEvent → ObservabilityEvent
// ---------------------------------------------------------------------------

export interface RegisterObservabilityDispatcherDeps {
	readonly dispatcher: ObservabilityDispatcher;
	readonly now?: () => Date;
	readonly logger?: Logger;
}

export function registerObservabilityDispatcher(
	bus: EventBus,
	deps: RegisterObservabilityDispatcherDeps,
): () => void {
	const nowFn = deps.now ?? ((): Date => new Date());

	function nowIso(timestamp?: number): string {
		if (typeof timestamp === "number") return new Date(timestamp).toISOString();
		return nowFn().toISOString();
	}

	/**
	 * The trace id for an event tied to a session: the session id itself.
	 *
	 * An empty `sessionId` is never a valid trace — we refuse to collapse every
	 * "unknown" event onto a single empty trace (adversary review H3 WARN:
	 * empty-sessionId), so callers pass a unique `fallback` (e.g. `"unknown"`).
	 */
	function traceFor(sessionId: string, fallback: string): string {
		if (sessionId.length === 0) return fallback;
		return sessionId;
	}

	/**
	 * Translate a DomainEvent into an ObservabilityEvent and enqueue it.
	 * Returns `true` if the event was translated, `false` if it was
	 * explicitly dropped (the default branch). The return value lets the
	 * wildcard handler distinguish dropped-vs-translated for diagnostics
	 * + tests.
	 */
	function translateDomainEvent(event: DomainEvent): boolean {
		switch (event.type) {
			case "session_started": {
				const ev = event as SessionStartedEvent;
				// @lore session_started's streamId is always the sessionId.
				const traceId = traceFor(ev.sessionId, ev.sessionId || "unknown");
				deps.dispatcher.enqueue({
					kind: "session_started",
					traceId,
					sessionId: ev.sessionId,
					ts: nowIso(ev.timestamp),
					agentId: ev.agentId,
					taskId: ev.taskId,
				});
				return true;
			}
			case "session_ended": {
				const ev = event as SessionEndedEvent;
				const traceId = traceFor(ev.sessionId, ev.sessionId || "unknown");
				deps.dispatcher.enqueue({
					kind: "session_ended",
					traceId,
					sessionId: ev.sessionId,
					ts: nowIso(ev.timestamp),
					agentId: ev.agentId,
					taskId: ev.taskId,
					outcome: ev.outcome,
				});
				return true;
			}
			case "tool_call_recorded": {
				const ev = event as ToolCallRecordedEvent;
				const traceId = traceFor(ev.sessionId, ev.sessionId || "unknown");
				deps.dispatcher.enqueue({
					kind: "tool_call",
					traceId,
					sessionId: ev.sessionId,
					ts: nowIso(ev.timestamp),
					toolName: ev.toolName,
					argsSummary: ev.argsSummary,
				});
				return true;
			}
			case "task_state_changed": {
				const ev = event as TaskStateChangedEvent;
				// Tasks live across sessions; no 1:1 session correlation. We
				// use the taskId as trace id so task-scoped traces coalesce.
				deps.dispatcher.enqueue({
					kind: "task_state_changed",
					traceId: `task:${ev.taskId}`,
					sessionId: null,
					ts: nowIso(ev.timestamp),
					taskId: ev.taskId,
					fromState: ev.fromState,
					toState: ev.toState,
				});
				return true;
			}
			case "bet_state_changed": {
				const ev = event as BetStateChangedEvent;
				deps.dispatcher.enqueue({
					kind: "bet_state_changed",
					traceId: `bet:${ev.betId}`,
					sessionId: null,
					ts: nowIso(ev.timestamp),
					betId: ev.betId,
					fromState: ev.fromState,
					toState: ev.toState,
				});
				return true;
			}
			case "knowledge_updated": {
				const ev = event as KnowledgeUpdatedEvent;
				deps.dispatcher.enqueue({
					kind: "knowledge_write",
					traceId: `knowledge:${ev.itemId}`,
					sessionId: null,
					ts: nowIso(ev.timestamp),
					itemId: ev.itemId,
					action: ev.action,
				});
				return true;
			}
			// Explicitly-ignored event kinds. Future DomainEvent additions
			// will either slot into a new case or be dropped here with an
			// exhaustive default.
			// @lore AF4/§4g: `response_recorded` and `bet_committed` were removed
			// from `DomainEvent` (o1-event-split) — their dead `case` labels are
			// dropped. They fell through to `return false`, identical to the default,
			// so removal is behaviour-neutral.
			case "item_created":
			case "routine_fired":
			case "dependency_met":
			case "bet_revised":
			case "notification":
			// R6: artifact_created is a kernel event forwarded to WsBroadcaster
			// for UI invalidation but not translated to an observability event.
			case "artifact_created":
			// @lore AF4/§5: conversation, propagation, and knowledge-lifecycle
			// events are not translated to observability events — they hit the
			// (previous) default `return false`. Listed explicitly so the
			// exhaustive-never default catches genuinely-new DomainEvent kinds.
			// Behaviour-neutral (identical to the prior default).
			case "thread_created":
			case "thread_message_appended":
			case "thread_resolved":
			case "thread_reopened":
			case "thread_archived":
			case "propagation_applied":
			case "propagation_failed":
			case "knowledge_accessed":
			case "knowledge_archived":
			case "knowledge_created":
			// AK6: creation events are not translated to observability events.
			// They are observed via the event bus by AK7/AK8 and audit subscribers.
			case "team_created":
			case "agent_added":
			case "user_created":
			// AK7: selection occasion event — audit-only in AK7, not an observability event.
			case "work_selection_requested":
			// AL7 trust-first: proposed call executed/granted — audit-only, not an observability event.
			case "proposed_call_executed":
			case "proposed_call_granted":
			// AU9 durable handoff/lifecycle facts are consumed by domain projections.
			case "agent_work_intent_recorded":
			case "agent_run_lifecycle_changed":
			// AU21 §6 Decision B4: the pre-handoff failure report-back channel —
			// consumed by `registerAgentRunAdmissionReactions`, not an
			// observability event.
			case "agent_run_admission_failed":
			// Return-gate escape surface — surfaced via bus, not an observability metric.
			case "session_not_returned":
			// AU19 Increment 3f: filesystems ⚠ capture-writeback EventBus inversion —
			// internal plumbing between two Services, not an observability event.
			case "sandbox_writeback_changes_detected":
			// AU19 Increment 3i: policy ⚠ session-lifecycle EventBus inversion —
			// internal session-termination-request plumbing between two Services
			// (AU21 Increment 14a: the cost-dedup-cleanup consumer this event
			// originally carried at AU19 Increment 3g is gone, deleted with the
			// rest of the cost feature), not an observability event (the real
			// observable outcome is the handoff's own
			// task_state_changed/item_created, already translated above).
			case "session_handoff_completed":
				return false;
			default: {
				// Exhaustiveness check — if a new DomainEvent kind is added
				// without updating this switch, the compiler will flag it.
				const Never: never = event;
				void Never;
				return false;
			}
		}
	}

	const unsub = bus.on("*", (event: DomainEvent) => {
		translateDomainEvent(event);
	});

	return (): void => {
		unsub();
	};
}

// AU20 Ab3: `summarizeToolArgs` relocated to `@hyperidle/shared` (redact.ts).
// Import it from there; the copy here was dead after the move.
