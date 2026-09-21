/**
 * ParentPicker — the destination picker for nesting or moving a document,
 * shared by the create flow (nest at create time) and MoveDialog (move an
 * existing document). The document-specific adapter over the shared
 * `Combobox`: it owns the fetch and the `buildParentOptions` narrowing,
 * `Combobox` owns the picking.
 *
 * Fetches the full visible tree via `useDocuments({ inTree: true })` — the
 * same door `DocumentList` uses to build its own tree — and narrows it to
 * the legal choices with `buildParentOptions`, so a person is never offered
 * a move the server will reject (see that function's own doc comment for
 * what a concurrent edit can still invalidate between render and submit).
 *
 * @lore BC4: `useFetch("/api/knowledge")` replaced by `useDocuments`
 * (architecture.md §9.2) — same narrowing, one fewer hand-shaped response
 * type.
 *
 * @lore BA6: was a plain `Select`; migrated to `Combobox` (client-filtered —
 * the tree is already fetched in full, so no `onQueryChange`). "" (top
 * level) is a real, always-legal option; `Combobox` shows it as the closed
 * trigger's placeholder rather than a chosen label, same as every other
 * empty-means-"none" picker in the app.
 */

import { type JSX, useMemo } from "react";
import { Combobox } from "../../ds";
import { useDocuments } from "../../hooks/useDocuments.js";
import { buildParentOptions, type ParentCandidate } from "./parent-options.js";

export interface ParentPickerProps {
	/** "" means "top level" (no parent) — always a legal choice. */
	value: string;
	onChange: (value: string) => void;
	/** Omit when creating a brand-new document — nothing can be its own descendant yet. */
	excludeId?: string;
	/** The document's own scope (current, or about-to-be-created-with) — governs the narrowing rule. */
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
	const { status, documents } = useDocuments({ inTree: true });

	const options = useMemo(() => {
		const candidates: ParentCandidate[] = documents.map((item) => ({
			id: item.id,
			title: item.title,
			scopeKind: item.scopeKind,
			parentId: item.parentId,
			parentKind: item.parentKind,
		}));
		const legal = buildParentOptions(candidates, { excludeId, childScopeKind });
		return [
			{ id: "", label: "No parent (top level)" },
			...legal.map((o) => ({ id: o.value, label: o.label })),
		];
	}, [documents, excludeId, childScopeKind]);

	return (
		<Combobox
			id="document-parent-picker"
			label="Parent"
			value={value}
			onChange={onChange}
			disabled={disabled || status === "loading"}
			placeholder="No parent (top level)"
			listAriaLabel="Documents"
			inputAriaLabel="Filter documents"
			options={options}
		/>
	);
}
