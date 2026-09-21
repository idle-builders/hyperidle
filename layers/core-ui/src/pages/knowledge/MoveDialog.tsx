/**
 * MoveDialog — moves an existing knowledge item to a new parent, including
 * back to the top level. plan.md AC2: "a person can nest and move knowledge
 * items, and the tree keeps up."
 *
 * @lore nested-knowledge-items: same Dialog primitive pattern as
 * ScopeChangeDialog — one field, saved through the same PATCH endpoint
 * `reparent()` already routes a parentKind+parentId body through
 * (routes/knowledge.ts). ParentPicker only ever offers a choice
 * `buildParentOptions` computed as legal; a concurrent edit between render
 * and submit can still make it illegal, so a refusal shows the 400's named
 * reason (`error`) rather than a generic failure.
 */

import { type JSX, useState } from "react";
import { Button, Dialog } from "../../ds";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { apiFetch } from "../../services/api-fetch.js";
import { ParentPicker } from "./ParentPicker.js";

export interface MoveDialogProps {
	open: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** The knowledge item id being moved. */
	knowledgeId: string;
	/** Current version for optimistic concurrency. */
	currentVersion: number;
	/** The item's current parent, or null when it is already a root. */
	currentParentId: string | null;
	/** The item's current parent kind — only a `document` parent is a pre-selectable choice. */
	currentParentKind: string | null;
	/** The item's own scope — governs which parents ParentPicker offers (the narrowing rule). */
	scopeKind: string;
}

export function MoveDialog({
	open,
	onClose,
	onSaved,
	knowledgeId,
	currentVersion,
	currentParentId,
	currentParentKind,
	scopeKind,
}: MoveDialogProps): JSX.Element {
	const { user } = useCurrentUser();

	const initialParentId = currentParentKind === "document" ? (currentParentId ?? "") : "";
	const [selectedParentId, setSelectedParentId] = useState(initialParentId);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isDirty = selectedParentId !== initialParentId;
	const canSave = isDirty && !submitting;

	const handleSave = async (): Promise<void> => {
		setSubmitting(true);
		setError(null);

		const toRoot = selectedParentId === "";
		const payload = {
			version: currentVersion,
			updatedBy: user?.id ?? "human",
			parentKind: toRoot ? null : "document",
			parentId: toRoot ? null : selectedParentId,
		};

		const res = await apiFetch(`/api/knowledge/${encodeURIComponent(knowledgeId)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to move: ${res.status}`);
			setSubmitting(false);
			return;
		}

		setSubmitting(false);
		onSaved();
		onClose();
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Move"
			isDirty={isDirty}
			size="sm"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={!canSave}>
						{submitting ? "…" : "Save"}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<ParentPicker
					value={selectedParentId}
					onChange={setSelectedParentId}
					excludeId={knowledgeId}
					childScopeKind={scopeKind}
					disabled={submitting}
				/>
				{error && (
					<p role="alert" className="type-metadata  text-error">
						{error}
					</p>
				)}
			</div>
		</Dialog>
	);
}
