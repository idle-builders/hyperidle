import { EventEmitter } from "node:events";

export const KnowledgeEventType = {
	UPDATED: "knowledge_item_updated",
} as const;

export interface KnowledgeItemUpdatedEvent {
	type: typeof KnowledgeEventType.UPDATED;
	itemId: string;
	version: number;
}

class KnowledgeEventEmitter extends EventEmitter {
	emit(event: string, payload: KnowledgeItemUpdatedEvent): boolean {
		return super.emit(event, payload);
	}

	on(event: string, listener: (payload: KnowledgeItemUpdatedEvent) => void): this {
		return super.on(event, listener);
	}
}

export const knowledgeEvents = new KnowledgeEventEmitter();
