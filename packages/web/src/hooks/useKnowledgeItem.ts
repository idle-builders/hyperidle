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
	scopeId: string | null;
	topic: string | null;
	createdAt: string;
	updatedAt: string;
}

export function useKnowledgeItem(id: string | undefined): FetchState<KnowledgeItemData> {
	return useFetch<KnowledgeItemData>(id !== undefined ? `/api/knowledge/${id}` : null);
}
