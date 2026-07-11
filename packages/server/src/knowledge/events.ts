import { EventEmitter } from "node:events";

export const KnowledgeEventType = {
	UPDATED: "knowledge_item_updated",
} as const;

export interface KnowledgeItemUpdatedEvent {
	type: typeof KnowledgeEventType.UPDATED;
	itemId: string;
	version: number;
}

/**
 * Interface for the knowledge event emitter — implemented by both the
 * legacy Node.js EventEmitter and the injectable adapter.
 */
export interface KnowledgeEventEmitterLike {
	emit(event: string, payload: KnowledgeItemUpdatedEvent): boolean;
	on(event: string, listener: (payload: KnowledgeItemUpdatedEvent) => void): unknown;
	removeAllListeners(event?: string): unknown;
}

class KnowledgeEventEmitter extends EventEmitter implements KnowledgeEventEmitterLike {
	emit(event: string, payload: KnowledgeItemUpdatedEvent): boolean {
		return super.emit(event, payload);
	}

	on(event: string, listener: (payload: KnowledgeItemUpdatedEvent) => void): this {
		return super.on(event, listener);
	}
}

/**
 * @lore I6: knowledgeEvents is now replaceable via `setKnowledgeEventBus()`.
 * The default is a standalone EventEmitter (backward-compatible with existing
 * callers and tests). Production wiring in `app.ts` calls
 * `setKnowledgeEventBus()` with an adapter that bridges to the shared EventBus,
 * aligning knowledge events with the rest of the domain event system.
 */
let KnowledgeEvents: KnowledgeEventEmitterLike = new KnowledgeEventEmitter();

/** Get the current knowledge event emitter. */
export function getKnowledgeEvents(): KnowledgeEventEmitterLike {
	return KnowledgeEvents;
}

/**
 * Replace the knowledge event emitter with an injected instance.
 * Call this from app setup to wire knowledge events into the shared EventBus.
 */
export function setKnowledgeEventBus(emitter: KnowledgeEventEmitterLike): void {
	KnowledgeEvents = emitter;
}

/**
 * @deprecated Use `getKnowledgeEvents()` instead. Retained for backward
 * compatibility with existing imports in tests and callers.
 */
export const knowledgeEvents = new Proxy({} as KnowledgeEventEmitterLike, {
	get(_target, prop: string) {
		// @lore AF3: Reflect.get performs a safe property lookup without any cast.
		// KnowledgeEventEmitterLike has no index signature, so bracket-access
		// required an unsafe `as unknown as Record<string, unknown>` escape hatch.
		// Reflect.get(obj, key) returns unknown and preserves runtime behavior exactly.
		return Reflect.get(KnowledgeEvents, prop);
	},
});
