import { createLogger } from "@hyperidle/diagnostics";
import type {
	DomainEvent,
	EventByType,
	EventHandler,
	EventType,
	WildcardHandler,
} from "@hyperidle/domain-model";

/**
 * Module-scoped logger used to surface handler failures. Captured via
 * `vi.mock("@hyperidle/diagnostics", ...)` in tests — vitest hoists vi.mock
 * calls before module initialization, so the mock is in place when this runs.
 */
const logger = createLogger({ pkg: "event-bus" });

/**
 * In-process pub/sub event bus with per-stream ordering and type-safe subscriptions.
 *
 * Events are delivered synchronously — emit() returns only after all handlers
 * have been called. This guarantees at-least-once delivery when emit() is called
 * after database write durability.
 *
 * @lore I1 EventBus resilience: one throwing handler must not abort delivery
 * to subsequent handlers. A single bad subscriber (e.g. a newly-added
 * observability forwarder that hits a transient error) would
 * otherwise silently break every durability-critical subscriber registered
 * after it. We isolate per-handler failures with try/catch and log via
 * `createLogger` so the error remains observable. Throwing handlers are still
 * a programming error — this guard limits the blast radius, it does not
 * condone them.
 */
export class EventBus {
	private readonly handlers = new Map<EventType, Set<EventHandler<EventType>>>();
	private readonly wildcardHandlers = new Set<WildcardHandler>();

	/**
	 * Subscribe to a specific event type or wildcard ('*').
	 * Returns an unsubscribe function for convenience.
	 */
	on<T extends EventType>(type: T, handler: EventHandler<T>): () => void;
	on(type: "*", handler: WildcardHandler): () => void;
	on(type: EventType | "*", handler: EventHandler<EventType> | WildcardHandler): () => void {
		if (type === "*") {
			this.wildcardHandlers.add(handler as WildcardHandler);
			return () => this.off("*", handler as WildcardHandler);
		}

		let set = this.handlers.get(type);
		if (!set) {
			set = new Set();
			this.handlers.set(type, set);
		}
		set.add(handler as EventHandler<EventType>);
		return () => this.off(type, handler as EventHandler<EventType>);
	}

	/**
	 * Unsubscribe a handler from a specific event type or wildcard.
	 * Internal helper — callers use the unsubscribe function returned by `on`.
	 */
	private off<T extends EventType>(type: T, handler: EventHandler<T>): void;
	private off(type: "*", handler: WildcardHandler): void;
	private off(type: EventType | "*", handler: EventHandler<EventType> | WildcardHandler): void {
		if (type === "*") {
			this.wildcardHandlers.delete(handler as WildcardHandler);
			return;
		}

		const set = this.handlers.get(type);
		if (set) {
			set.delete(handler as EventHandler<EventType>);
			if (set.size === 0) {
				this.handlers.delete(type);
			}
		}
	}

	/**
	 * Emit an event synchronously to all matching subscribers.
	 *
	 * Delivery order: type-specific handlers first (insertion order),
	 * then wildcard handlers (insertion order).
	 *
	 * This method is synchronous to support at-least-once delivery semantics:
	 * call emit() after database write durability to guarantee delivery.
	 */
	emit<T extends EventType>(event: EventByType<T>): void {
		const set = this.handlers.get(event.type);
		if (set) {
			for (const handler of set) {
				try {
					// @lore AF2: Handlers are stored as EventHandler<EventType> (i.e. (e: DomainEvent) => void)
					// because the map must hold a uniform type. At runtime the handler stored at event.type
					// was registered via on<T>(event.type, handler) so it only ever receives events of type T.
					// Calling with `event as DomainEvent` is safe: the stored handler accepts DomainEvent.
					// We avoid casting to EventHandler<T> (which fails the overlap check) and instead cast the
					// event to the stored handler's expected type — the wider direction is always safe.
					(handler as (e: DomainEvent) => void)(event as DomainEvent);
				} catch (err) {
					logger.error("event handler threw", {
						type: event.type,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}

		for (const handler of this.wildcardHandlers) {
			try {
				handler(event);
			} catch (err) {
				logger.error("wildcard event handler threw", {
					type: event.type,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}
	}
}
