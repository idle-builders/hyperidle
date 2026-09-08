/**
 * useParentedKnowledgeItems — fetch knowledge items by parent.
 *
 * Calls GET /api/knowledge?parentKind=<kind>&parentId=<id>. The server
 * returns only items whose parent matches exactly — parented items are
 * excluded from the default knowledge list (GET /api/knowledge) and
 * accessible only through this query.
 *
 * Returns an empty list (not null) when parentId is blank, so callers
 * never have to guard the id before rendering.
 */

import type { FetchState } from "./useFetch.js";
import { useFetch } from "./useFetch.js";
import type { KnowledgeItemData } from "./useKnowledgeItem.js";

export interface ParentedKnowledgeItemsResponse {
	items: KnowledgeItemData[];
}

export function useParentedKnowledgeItems(
	parentKind: "task" | "thread",
	parentId: string,
): FetchState<ParentedKnowledgeItemsResponse> {
	const url = parentId
		? `/api/knowledge?parentKind=${encodeURIComponent(parentKind)}&parentId=${encodeURIComponent(parentId)}`
		: null;
	return useFetch<ParentedKnowledgeItemsResponse>(url);
}
