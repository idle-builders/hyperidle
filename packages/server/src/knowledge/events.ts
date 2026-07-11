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

const KnowledgeEvents: KnowledgeEventEmitterLike = new KnowledgeEventEmitter();

/** Get the current knowledge event emitter. */
export function getKnowledgeEvents(): KnowledgeEventEmitterLike {
	return KnowledgeEvents;
}
