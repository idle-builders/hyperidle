/**
 * MoveDialog — moves an existing document to a new parent, including back to
 * the top level. The rule: "a person can nest and move knowledge items,
 * and the tree keeps up."
 *
 * @lore BC4: PATCH `/api/knowledge/:id` replaced by
 * `call("edit_document", { id, parent, version })` (architecture.md §9.2).
 * `ParentPicker` only ever offers a choice `buildParentOptions` computed as
 * legal; a concurrent edit between render and submit can still make it
 * illegal, so a refusal shows the action's own named problem rather than a
 * generic failure.
 */

import { type JSX, useState } from "react";
import { Button, Dialog } from "../../ds";
import { call } from "../../services/call.js";
import { ParentPicker } from "./ParentPicker.js";

export interface MoveDialogProps {
	open: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** The document id being moved. */
	documentId: string;
	/** Current version for optimistic concurrency. */
	currentVersion: number;
	/** The document's current parent, or null when it is already a root. */
	currentParentId: string | null;
	/** The document's current parent kind — only a `document` parent is a pre-selectable choice. */
	currentParentKind: string | null;
	/** The document's own scope — governs which parents ParentPicker offers (the narrowing rule). */
	scopeKind: string;
}

export function MoveDialog({
	open,
	onClose,
	onSaved,
	documentId,
	currentVersion,
	currentParentId,
	currentParentKind,
	scopeKind,
}: MoveDialogProps): JSX.Element {
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
		const result = await call("edit_document", {
			id: documentId,
			version: currentVersion,
			parent: toRoot ? null : { kind: "document", id: selectedParentId },
		});

		if (!result.ok) {
			setError(result.problems[0]?.message ?? "Failed to move");
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
					excludeId={documentId}
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
