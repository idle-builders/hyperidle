import { KNOWLEDGE_LAYERS, type KnowledgeLayer } from "@hyperidle/shared";

export function isValidLayer(value: string): value is KnowledgeLayer {
	return (KNOWLEDGE_LAYERS as readonly string[]).includes(value);
}

export function layerDepth(layer: KnowledgeLayer): number {
	return Number(layer[1]);
}
