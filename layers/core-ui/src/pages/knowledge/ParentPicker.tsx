/**
 * ParentPicker — the destination picker for nesting or moving a knowledge
 * item, shared by the create flow (nest at create time) and MoveDialog
 * (move an existing item). Extract-not-invent: a plain `Select`, the same DS
 * primitive ScopeChangeDialog and KnowledgeCreate already use for a bounded
 * choice.
 *
 * Fetches the full visible tree via `GET /api/knowledge` — the same read
 * KnowledgeList uses to build its own tree — and narrows it to the legal
 * choices with `buildParentOptions`, so a person is never offered a move the
 * server will reject (see that function's own doc comment for what a
 * concurrent edit can still invalidate between render and submit).
 */

import { type JSX, useMemo } from "react";
import { Select } from "../../ds";
import { useFetch } from "../../hooks/useFetch.js";
import { buildParentOptions, type ParentCandidate } from "./parent-options.js";

interface KnowledgeListResponseItem {
	id: string;
	title: string;
	scopeKind?: string;
	parentId?: string | null;
	parentKind?: string | null;
}

interface KnowledgeListResponse {
	items: KnowledgeListResponseItem[];
}

export interface ParentPickerProps {
	/** "" means "top level" (no parent) — always a legal choice. */
	value: string;
	onChange: (value: string) => void;
	/** Omit when creating a brand-new item — nothing can be its own descendant yet. */
	excludeId?: string;
	/** The item's own scope (current, or about-to-be-created-with) — governs the narrowing rule. */
	childScopeKind: string;
	disabled?: boolean;
}

export function ParentPicker({
	value,
	onChange,
	excludeId,
	childScopeKind,
	disabled = false,
}: ParentPickerProps): JSX.Element {
	const { data, isLoading } = useFetch<KnowledgeListResponse>("/api/knowledge");

	const options = useMemo(() => {
		const candidates: ParentCandidate[] = (data?.items ?? []).map((item) => ({
			id: item.id,
			title: item.title,
			scopeKind: item.scopeKind ?? "factory",
			parentId: item.parentId ?? null,
			parentKind: item.parentKind ?? null,
		}));
		return buildParentOptions(candidates, { excludeId, childScopeKind });
	}, [data, excludeId, childScopeKind]);

	return (
		<Select
			label="Parent"
			data-testid="parent-picker"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled || isLoading}
			options={[{ value: "", label: "No parent (top level)" }, ...options]}
		/>
	);
}
