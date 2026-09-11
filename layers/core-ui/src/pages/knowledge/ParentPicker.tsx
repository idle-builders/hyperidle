/**
 * ParentPicker — the destination picker for nesting or moving a knowledge
 * item, shared by the create flow (nest at create time) and MoveDialog
 * (move an existing item). The knowledge-specific adapter over the shared
 * `Combobox`: it owns the fetch and the `buildParentOptions` narrowing,
 * `Combobox` owns the picking.
 *
 * Fetches the full visible tree via `GET /api/knowledge` — the same read
 * KnowledgeList uses to build its own tree — and narrows it to the legal
 * choices with `buildParentOptions`, so a person is never offered a move the
 * server will reject (see that function's own doc comment for what a
 * concurrent edit can still invalidate between render and submit).
 *
 * @lore BA6: was a plain `Select`; migrated to `Combobox` (client-filtered —
 * the tree is already fetched in full, so no `onQueryChange`). "" (top
 * level) is a real, always-legal option; `Combobox` shows it as the closed
 * trigger's placeholder rather than a chosen label, same as every other
 * empty-means-"none" picker in the app.
 */

import { type JSX, useMemo } from "react";
import { Combobox } from "../../ds";
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
		const legal = buildParentOptions(candidates, { excludeId, childScopeKind });
		return [
			{ id: "", label: "No parent (top level)" },
			...legal.map((o) => ({ id: o.value, label: o.label })),
		];
	}, [data, excludeId, childScopeKind]);

	return (
		<Combobox
			id="knowledge-parent-picker"
			label="Parent"
			value={value}
			onChange={onChange}
			disabled={disabled || isLoading}
			placeholder="No parent (top level)"
			listAriaLabel="Knowledge items"
			inputAriaLabel="Filter knowledge items"
			options={options}
		/>
	);
}
