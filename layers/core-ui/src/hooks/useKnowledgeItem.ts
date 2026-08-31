/**
 * useKnowledgeItem — thin fetch hook for GET /api/knowledge/:id.
 *
 * Returns FetchState<KnowledgeItemData> with the full item from the API.
 * When id is undefined, no fetch is triggered (data=null, isLoading=false).
 *
 * @lore T2: The KnowledgeItemData interface mirrors the knowledge_items DB
 * row shape returned by the server. Defined here (not imported from
 * KnowledgeList) to avoid page-level coupling. See architecture.md § 3.2.
 */

import type { KnowledgeRole } from "@hyperidle/domain-model";
import type { FetchState } from "./useFetch.js";
import { useFetch } from "./useFetch.js";

export interface KnowledgeItemData {
	id: string;
	title: string;
	body: string;
	format: string;
	status: string;
	version: number;
	updatedBy: string;
	scopeKind: string;
	/** What context assembly does with this document; absent on older responses. */
	role?: KnowledgeRole;
	scopeId: string | null;
	topic: string | null;
	createdAt: string;
	updatedAt: string;
	/** W3 AC-40: kind field from API (may be absent in older API versions) */
	kind?: string;
	/** W3 AC-40: layer field from API (may be absent in older API versions) */
	layer?: string;
	/** W3 AC-40: confidence score 0–1 */
	confidence?: number;
	/** W3 AC-40: 30-day access count */
	accessCount?: number;
	/** W3 AC-41: related items with id and title */
	relatedItems?: ReadonlyArray<{ id: string; title: string }>;
	/** AV3: resolved human-readable scope name — response-only, never persisted */
	scopeName?: string;
}

export function useKnowledgeItem(id: string | undefined): FetchState<KnowledgeItemData> {
	return useFetch<KnowledgeItemData>(id !== undefined ? `/api/knowledge/${id}` : null);
}
