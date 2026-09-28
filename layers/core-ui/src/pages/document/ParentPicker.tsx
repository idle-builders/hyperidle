// @lore: ParentPicker empty string — "" (top level) is a real always-legal option; Combobox shows it as placeholder, not a chosen label

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
