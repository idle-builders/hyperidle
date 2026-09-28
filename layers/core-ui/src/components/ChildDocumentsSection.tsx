/**
 * ChildDocumentsSection — documents parented to a task or thread surface.
 *
 * Shows documents parented to a task or thread — produced items are documents
 * with `as:"artifact"` and a task/thread parent.
 *
 * Data: `search_documents({ parent: { kind, id }, as: "artifact" })` — both
 * together keeps this list to exactly the produced items under this host.
 *
 * Interaction: clicking a row enters split mode — the list stays as origin,
 * the selected item's body renders as destination.
 */

import { type JSX, useMemo, useState } from "react";
import {
	EmptyState,
	ErrorState,
	type FoldMode,
	ItemList,
	Row,
	SectionLabel,
	SkeletonList,
	SplitView,
} from "../ds";
import { useDocument } from "../hooks/useDocument.js";
import { useDocuments } from "../hooks/useDocuments.js";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { DocumentBody } from "../pages/document/DocumentBody.js";

export interface ChildDocumentsSectionProps {
	parentKind: "task" | "thread";
	parentId: string;
	heading?: string;
	emptyDescription?: string;
	/**
	 * Hand the click to the caller instead of splitting here.
	 *
	 * A surface that already owns a `SplitView` — the conversation page does —
	 * must not have a second one nested inside it: two splits on one screen
	 * fight over the same gesture and the same width. When this is given, the
	 * section is just the list, and the caller decides what "open" means.
	 */
	onOpen?: (itemId: string) => void;
}

/**
 * Detail pane rendered inside the SplitView destination when an item is
 * selected. Fetches the full body and renders it through `DocumentBody` — the
 * same path a document's own page takes.
 *
 * That shared path is the point, not a convenience. It is what makes a produced
 * item that IS an interactive document — a body whose only block is a fenced
 * ```html block — run in the sandbox frame here too. Rendering the body as
 * `<pre>` text instead would show an interactive artifact as its own source.
 */
function DocumentDetailPane({ itemId }: { itemId: string }): JSX.Element {
	const { status, data } = useDocument(itemId);

	if (status === "loading" || status === "idle") {
		return (
			<div data-testid="artifact-section-detail" className="p-[24px]">
				<SkeletonList rows={3} ariaLabel="Loading document" />
			</div>
		);
	}

	if (data === null) {
		return (
			<div data-testid="artifact-section-detail" className="p-[24px]">
				<EmptyState compact title="Not found" description="Could not load this document." />
			</div>
		);
	}

	const { document } = data;
	return (
		<div data-testid="artifact-section-detail" className="flex flex-col gap-[12px] p-[24px]">
			<h2 className="type-title">{document.title}</h2>
			<DocumentBody body={document.body} hostId={document.id} documentTitle={document.title} />
		</div>
	);
}

export function ChildDocumentsSection({
	parentKind,
	parentId,
	heading,
	emptyDescription,
	onOpen,
}: ChildDocumentsSectionProps): JSX.Element | null {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("artifact-section", 0.42);

	// useMemo keeps the filter referentially stable so useDocuments' effect does not refire every render.
	const filter = useMemo(
		() => ({ parent: { kind: parentKind, id: parentId }, as: "artifact" as const }),
		[parentKind, parentId],
	);
	const { status, documents, error } = useDocuments(filter);
	const isLoading = status === "loading";

	// ── Loading ──────────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<section data-testid="artifact-section-container" aria-label={heading ?? "Documents"}>
				{heading && <SectionLabel label={heading} divider />}
				<SkeletonList rows={2} ariaLabel="Loading documents" />
			</section>
		);
	}

	// ── Error ─────────────────────────────────────────────────────────────────

	if (error !== null) {
		if (!heading) return null;
		return (
			<section data-testid="artifact-section-container" aria-label={heading}>
				<SectionLabel label={heading} divider />
				<ErrorState
					compact
					title="Failed to load documents"
					description="An error occurred while loading documents."
				/>
			</section>
		);
	}

	// ── Empty ─────────────────────────────────────────────────────────────────

	const items = documents;

	if (items.length === 0) {
		if (!heading) return null;
		return (
			<section data-testid="artifact-section-container" aria-label={heading}>
				<SectionLabel label={heading} divider />
				<EmptyState
					compact
					title="No documents yet"
					description={
						emptyDescription ??
						"Documents will appear here once agents produce output for this context."
					}
				/>
			</section>
		);
	}

	// ── Populated ────────────────────────────────────────────────────────────

	const origin = (
		<div className="flex flex-col gap-[9px]">
			{heading && <SectionLabel label={heading} divider />}
			<ItemList variant="flush" isEmpty={false}>
				{items.map((item) => (
					<Row
						key={item.id}
						as="div"
						title={item.title}
						subtitle={item.status}
						selected={onOpen ? false : selectedId === item.id}
						onClick={() => {
							if (onOpen) {
								onOpen(item.id);
								return;
							}
							setSelectedId(item.id);
							setSplitMode("split");
						}}
					/>
				))}
			</ItemList>
		</div>
	);

	const destination = selectedId ? (
		<DocumentDetailPane itemId={selectedId} />
	) : (
		<EmptyState compact title="Select a document" description="Click a row to view its content." />
	);

	if (onOpen) {
		return (
			<section
				data-testid="artifact-section-container"
				aria-label={heading ?? "Documents"}
				className="flex flex-col"
			>
				{origin}
			</section>
		);
	}

	return (
		<section
			data-testid="artifact-section-container"
			aria-label={heading ?? "Documents"}
			className="flex flex-col"
		>
			<SplitView
				surfaceKey="artifact-section"
				mode={splitMode}
				onModeChange={setSplitMode}
				dividerRatio={ratio}
				onRatioChange={setRatio}
				origin={origin}
				destination={destination}
			/>
		</section>
	);
}
