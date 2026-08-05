import type { ObservabilityEvent } from "./events.js";

/** Adapter channel — mirrors the configured adapter's `name`. */
export type ObservabilityChannel = "console" | "noop";

/**
 * Observability sink. Accepts a batch so network adapters can amortise
 * per-request overhead. The dispatcher never calls `record()` on the
 * hot path — it is invoked from a background timer.
 */
export interface ObservabilityAdapter {
	readonly name: ObservabilityChannel;
	/** Deliver a batch. Adapter MAY reject the whole batch on failure. */
	record(events: readonly ObservabilityEvent[]): Promise<void>;
	/** Force in-flight work to complete. Called on shutdown + tests. */
	flush(): Promise<void>;
}

export interface ObservabilityDispatcherStatus {
	readonly bufferDepth: number;
	readonly lastFlushAt: string | null;
	readonly lastErrorAt: string | null;
	readonly lastError: string | null;
	readonly dropped: number;
	readonly delivered: number;
	readonly adapter: ObservabilityChannel;
}

/**
 * Outcome of a `flush()` call. `flushed` counts delivered events since
 * flush started, `dropped` counts events lost to adapter errors during
 * the same flush, and `errors` counts the number of discrete adapter
 * failures encountered. Zero errors + zero dropped indicates a clean
 * drain.
 */
export interface FlushOutcome {
	readonly flushed: number;
	readonly dropped: number;
	readonly errors: number;
}

export interface ObservabilityDispatcher {
	/** Non-blocking enqueue. Safe to call from the event-bus hot path. */
	enqueue(event: ObservabilityEvent): void;
	/**
	 * Force the current buffer to the adapter. Resolves with a partial-
	 * drain report so callers can distinguish full success from partial.
	 */
	flush(): Promise<FlushOutcome>;
	/** Stop the background timer + unsubscribe from the bus. */
	dispose(): Promise<void>;
	/**
	 * Operator-visible snapshot.
	 *
	 * @lore AU26 C2: its one production caller was the deleted
	 * `GET /api/observability/status` route. It survives as the seam the
	 * dispatcher's own drop/deliver/last-error accounting is asserted through —
	 * if an operator surface returns, it reads from here.
	 */
	status(): ObservabilityDispatcherStatus;
}
