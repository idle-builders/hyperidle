/**
 * ArtifactSection — produced-item section for task and thread surfaces.
 *
 * Shows knowledge items parented to a task or thread. "Artifact" is the word
 * users see for content an agent produced — the founder call, per plan. The
 * storage concept (artifacts table) is gone; produced items are knowledge items
 * with a parent slot.
 *
 * Data: GET /api/knowledge?parentKind=<kind>&parentId=<id> — parented items
 * excluded from the default knowledge list (AC4/AC5).
 *
 * Interaction (AC10): clicking a row enters split mode — the list stays as
 * origin, the selected item's body renders as destination. Uses SplitView from
 * the DS, the standard pattern across settings surfaces.
 *
 * @lore ArtifactSection repoint: the previous version called useArtifacts and
 * read /api/artifacts. That route still exists while the deletion pass is
 * pending; this component is now decoupled from it.
 */

import { type JSX, useState } from "react";
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
import { useKnowledgeItem } from "../hooks/useKnowledgeItem.js";
import { useParentedKnowledgeItems } from "../hooks/useParentedKnowledgeItems.js";
import { useUiPreference } from "../hooks/useUiPreference.js";

export interface ArtifactSectionProps {
	parentKind: "task" | "thread";
	parentId: string;
	heading?: string;
	emptyDescription?: string;
}

/**
 * Detail pane rendered inside the SplitView destination when an item is
 * selected. Fetches the full body via useKnowledgeItem and renders it as text.
 * A full block-rendered view is intentionally deferred — the body is shown
 * here in raw form for the initial pass.
 */
function ArtifactDetailPane({ itemId }: { itemId: string }): JSX.Element {
	const { data, isLoading } = useKnowledgeItem(itemId);

	if (isLoading) {
		return (
			<div data-testid="artifact-section-detail" className="p-[24px]">
				<SkeletonList rows={3} ariaLabel="Loading artifact" />
			</div>
		);
	}

	if (!data) {
		return (
			<div data-testid="artifact-section-detail" className="p-[24px]">
				<EmptyState compact title="Not found" description="Could not load this artifact." />
			</div>
		);
	}

	return (
		<div data-testid="artifact-section-detail" className="flex flex-col gap-[12px] p-[24px]">
			<h2 className="type-title">{data.title}</h2>
			<pre className="type-small whitespace-pre-wrap text-[var(--text-secondary)]">{data.body}</pre>
		</div>
	);
}

export function ArtifactSection({
	parentKind,
	parentId,
	heading,
	emptyDescription,
}: ArtifactSectionProps): JSX.Element | null {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("artifact-section", 0.42);

	const { data, error, isLoading } = useParentedKnowledgeItems(parentKind, parentId);

	// ── Loading ──────────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<section data-testid="artifact-section-container" aria-label={heading ?? "Artifacts"}>
				{heading && <SectionLabel label={heading} divider />}
				<SkeletonList rows={2} ariaLabel="Loading artifacts" />
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
					title="Failed to load artifacts"
					description="An error occurred while loading artifacts."
				/>
			</section>
		);
	}

	// ── Empty ─────────────────────────────────────────────────────────────────

	const items = data?.items ?? [];

	if (items.length === 0) {
		if (!heading) return null;
		return (
			<section data-testid="artifact-section-container" aria-label={heading}>
				<SectionLabel label={heading} divider />
				<EmptyState
					compact
					title="No artifacts yet"
					description={
						emptyDescription ??
						"Artifacts will appear here once agents produce output for this context."
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
						selected={selectedId === item.id}
						onClick={() => {
							setSelectedId(item.id);
							setSplitMode("split");
						}}
					/>
				))}
			</ItemList>
		</div>
	);

	const destination = selectedId ? (
		<ArtifactDetailPane itemId={selectedId} />
	) : (
		<EmptyState compact title="Select an artifact" description="Click a row to view its content." />
	);

	return (
		<section
			data-testid="artifact-section-container"
			aria-label={heading ?? "Artifacts"}
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
