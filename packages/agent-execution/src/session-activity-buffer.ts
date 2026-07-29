/**
 * Q1 §6.1: In-memory ring buffer for session activity events.
 *
 * Subscribes to `tool_call_recorded` events from the EventBus and stores
 * a bounded number of activity entries per session. The buffer is ephemeral —
 * it is lost on server restart, which is acceptable for a desktop app.
 *
 * @lore Q1: Activity is intentionally not persisted. The dial-in view is a
 * live observation aid, not a durable audit log. A server restart is an
 * exceptional event and users re-opening the dial-in will see a fresh buffer.
 *
 * @lore AU20 B2c: folded from `@hyperidle/capture-writeback` into
 * `@hyperidle/run-orchestration`.
 *
 * @lore AU21 §6 Decision E / §9 Increment 7: relocated from
 * `@hyperidle/run-orchestration` (agent-orchestration) into
 * `@hyperidle/agent-execution` — the buffer's real architectural home, since
 * tokens/tool-calls originate in the execution Layer, not orchestration. The
 * move violates no data-access rule: the buffer imports only
 * `@hyperidle/shared` types/`EventBus` and touches no DB/Drizzle, carrying no
 * persistence concern into a Layer that must stay thin (Mechanism B). Served
 * to core-ui via `AgentOrchestrationPort.sessions.getRecentActivity`, which
 * gateways this same instance from agent-orchestration (see
 * `packages/core-api/src/services/agent-orchestration-port-composition.ts`
 * and `agent-orchestration-sessions-routes.ts`). Behavior is unchanged from
 * the pre-relocation class — see `__tests__/session-activity-buffer.test.ts`
 * for the ported behavioral suite.
 */

import type {
	ActivityEntry,
	EventBus,
	SessionEndedEvent,
	ToolCallRecordedEvent,
} from "@hyperidle/shared";

const MAX_PER_SESSION = 100;

// AM3: ActivityEntry is now the canonical type from @hyperidle/shared/session-activity.
// ToolCallData is preserved as a re-export for the server-side test that imports it.

// Eviction delay after session ends (ms). Entries are cleaned up after this window
// to allow late REST fetches to still see the final activity snapshot.
const EVICTION_DELAY_MS = 5 * 60 * 1000; // 5 minutes

export class SessionActivityBuffer {
	private readonly eventBus: EventBus;
	private readonly entries: Map<string, ActivityEntry[]> = new Map();
	private unsubscribers: Array<() => void> = [];
	// NodeJS.Timeout is not available in browser-compatible code; use ReturnType<typeof setTimeout>
	private evictionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/** Subscribe to the EventBus and begin collecting activity. */
	start(): void {
		if (this.unsubscribers.length > 0) return; // already started

		const toolCallHandler = (event: ToolCallRecordedEvent): void => {
			const { sessionId, toolName, argsSummary, timestamp } = event;
			const entry: ActivityEntry = {
				type: "tool_call",
				timestamp,
				data: { toolName, argsSummary },
			};

			let bucket = this.entries.get(sessionId);
			if (!bucket) {
				bucket = [];
				this.entries.set(sessionId, bucket);
			}
			bucket.push(entry);
			// Evict oldest if over cap (FIFO ring)
			if (bucket.length > MAX_PER_SESSION) {
				bucket.splice(0, bucket.length - MAX_PER_SESSION);
			}
		};

		// Q1 review issue #14: schedule buffer eviction after session ends.
		// Entries are kept for 5 minutes to allow the REST fetch to still serve
		// the final snapshot after the session ends. Then the bucket is removed.
		const sessionEndedHandler = (event: SessionEndedEvent): void => {
			const { sessionId } = event;
			// Cancel any existing timer for this session (e.g. double-ended edge case)
			const existing = this.evictionTimers.get(sessionId);
			if (existing) clearTimeout(existing);
			const timer = setTimeout(() => {
				this.entries.delete(sessionId);
				this.evictionTimers.delete(sessionId);
			}, EVICTION_DELAY_MS);
			this.evictionTimers.set(sessionId, timer);
		};

		const unsubToolCall = this.eventBus.on("tool_call_recorded", toolCallHandler);
		const unsubSessionEnded = this.eventBus.on("session_ended", sessionEndedHandler);

		this.unsubscribers.push(unsubToolCall, unsubSessionEnded);
	}

	/** Unsubscribe from the EventBus and stop collecting. */
	stop(): void {
		for (const unsub of this.unsubscribers) {
			unsub();
		}
		this.unsubscribers = [];
		// Cancel pending eviction timers
		for (const timer of this.evictionTimers.values()) {
			clearTimeout(timer);
		}
		this.evictionTimers.clear();
	}

	/**
	 * Return activity entries for a session in insertion order (oldest first).
	 * Returns an empty array for unknown sessions.
	 *
	 * @lore Q1 review issue #15: returns a defensive copy ([...bucket]) so
	 * callers cannot mutate the internal buffer. The spread avoids exposing a
	 * mutable reference while preserving ReadonlyArray semantics on the type.
	 */
	getActivity(sessionId: string): ReadonlyArray<ActivityEntry> {
		const bucket = this.entries.get(sessionId);
		return bucket ? [...bucket] : [];
	}
}
