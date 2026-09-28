// @lore: DocumentSlotList — slot set at creation, never edited; single writer for its slots; skills/rules only list today
// @lore: search_documents — filters by exactly one slot; two-slot callers run two hook calls (one per slot), not a loop

import type { DocumentSlot } from "@hyperidle/domain-model";
import { DOCUMENT_SLOT_LABEL } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
// hearth-internal-padding
import {
	Button,
	ErrorState,
	Input,
	ItemList,
	Row,
	SectionLabel,
	Select,
	SkeletonList,
	Tag,
} from "../ds";
import { useDocuments } from "../hooks/useDocuments.js";
import { call } from "../services/call.js";

export interface DocumentSlotListProps {
	/** Which slots this list shows, and which slots the create form offers.
	 * At most two — see the module doc for why. */
	slots: readonly DocumentSlot[];
	/** Lede paragraph explaining what the list is for. */
	description: ReactNode;
	/** Uppercase header above the row list. */
	sectionLabel: string;
	/** Shown in place of the list when there are no items. */
	emptyMessage: string;
	/** Uppercase header above the create form. */
	createLabel: string;
}

export function DocumentSlotList({
	slots,
	description,
	sectionLabel,
	emptyMessage,
	createLabel,
}: DocumentSlotListProps): JSX.Element {
	const navigate = useNavigate();

	const primarySlot = slots[0];
	const secondarySlot = slots[1];
	const primaryFilter = useMemo(
		() => (primarySlot ? { slot: primarySlot } : undefined),
		[primarySlot],
	);
	const secondaryFilter = useMemo(
		() => (secondarySlot ? { slot: secondarySlot } : undefined),
		[secondarySlot],
	);
	const primary = useDocuments(primaryFilter);
	const secondary = useDocuments(secondaryFilter);

	const isLoading = primary.status === "loading" || secondary.status === "loading";
	const error = primary.error ?? secondary.error;

	// search_documents has no combined-slot filter, so the list is the union
	// of the (at most two) per-slot searches, minus archived rows and
	// optimistically-removed ones.
	const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
	const items = [...primary.documents, ...secondary.documents]
		.filter((item) => item.status !== "archived")
		.filter((item) => !removedIds.has(item.id))
		.sort((a, b) => a.title.localeCompare(b.title));

	const [newTitle, setNewTitle] = useState("");
	const [newRole, setNewRole] = useState<DocumentSlot>(slots[0] ?? "ordinary");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	async function handleCreate(): Promise<void> {
		const title = newTitle.trim();
		if (!title) return;
		setCreating(true);
		setCreateError(null);
		try {
			const result = await call("edit_document", {
				title,
				body: "",
				format: "markdown",
				// A freshly created item must be live from the start, not sit
				// invisibly in triage.
				status: "active",
				scopeKind: "factory",
				slot: newRole,
			});
			if (result.ok) {
				setNewTitle("");
				navigate(`/documents/${result.data.document.id}`);
				return;
			}
			setCreateError(result.problems[0]?.message ?? "Could not create it.");
		} catch {
			setCreateError("Could not create it: network error");
		} finally {
			setCreating(false);
		}
	}

	function restore(id: string): void {
		setRemovedIds((prev) => {
			const next = new Set(prev);
			next.delete(id);
			return next;
		});
	}

	async function handleDelete(id: string): Promise<void> {
		setDeleteError(null);
		setRemovedIds((prev) => new Set(prev).add(id));
		try {
			// Archive is what delete means everywhere in this system — a hard
			// delete is impossible (the audit tables hold RESTRICT FKs).
			const result = await call("edit_document", { id, status: "archived" });
			if (!result.ok) {
				setDeleteError(result.problems[0]?.message ?? "Could not delete it.");
				restore(id);
			}
		} catch {
			setDeleteError("Could not delete it: network error");
			restore(id);
		}
	}

	if (isLoading) {
		return <SkeletonList rows={3} ariaLabel={`Loading ${sectionLabel.toLowerCase()}`} />;
	}

	if (error !== null) {
		return (
			<ErrorState
				compact
				title={`Couldn't load ${sectionLabel.toLowerCase()}`}
				description="Please check your connection and try again."
				onRetry={() => {
					primary.retry();
					secondary.retry();
				}}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-[24px]">
			<p className="type-metadata max-w-[560px]  text-[var(--text-tertiary)]">{description}</p>

			<div className="flex flex-col gap-[12px]">
				<SectionLabel label={sectionLabel} />
				<ItemList
					variant="boxed"
					isEmpty={items.length === 0}
					empty={{
						title: emptyMessage,
						description: "Create one below to get started.",
						dataTestId: "document-slot-empty",
					}}
				>
					{items.map((item) => (
						<Row
							key={item.id}
							data-testid="document-slot-row"
							title={item.title}
							actions={
								<>
									<Tag label={DOCUMENT_SLOT_LABEL[item.slot]} />
									<Button
										variant="ghost"
										tone="danger"
										size="sm"
										aria-label={`Delete ${item.title}`}
										onClick={() => void handleDelete(item.id)}
									>
										Delete
									</Button>
								</>
							}
							onClick={() => navigate(`/documents/${item.id}`)}
						/>
					))}
				</ItemList>
				{deleteError !== null && (
					<p role="alert" className="type-small  text-[var(--status-error)]">
						{deleteError}
					</p>
				)}
			</div>

			<div className="flex flex-col gap-[12px]">
				<SectionLabel label={createLabel} />
				<div className="flex items-end gap-[9px]">
					<div className="flex-1">
						<Input
							label="Title"
							value={newTitle}
							onChange={(e) => setNewTitle(e.target.value)}
							disabled={creating}
						/>
					</div>
					<Select
						label="Type"
						value={newRole}
						onChange={(e) => setNewRole(e.target.value as DocumentSlot)}
						disabled={creating}
						options={slots.map((r) => ({ value: r, label: DOCUMENT_SLOT_LABEL[r] }))}
					/>
					<Button
						variant="primary"
						size="default"
						onClick={() => void handleCreate()}
						disabled={creating || newTitle.trim().length === 0}
					>
						Create
					</Button>
				</div>
				{createError !== null && (
					<p role="alert" className="type-small  text-[var(--status-error)]">
						{createError}
					</p>
				)}
			</div>
		</div>
	);
}
