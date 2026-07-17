/**
 * ArtifactSection — shared section wrapper for the artifact view family.
 *
 * Renders artifacts fetched from useArtifacts in one of three layouts:
 *  - "gallery": ArtifactGalleryCard grid (formerly WorkPortfolio; AD9: WorkPortfolio retired)
 *  - "stack":   ArtifactStackItem list (WorkTeam, WorkBet)
 *  - "single":  ArtifactPreview for items[0] (TaskSheet)
 *
 * State machine:
 *  - loading  → SkeletonCard(s) or SkeletonList
 *  - error    → ErrorState
 *  - empty + heading  → EmptyState
 *  - empty without heading → null (TaskSheet pattern — no chrome when no artifact)
 *  - populated → layout-specific rendering
 *
 * Overflow: when nextCursor !== null, a non-interactive <span> "View all" is
 * rendered. It is NOT a link — the target page doesn't exist yet.
 *
 * @lore L12 (B-3): "View all" is deliberately a non-interactive <span>, NOT
 * an <a> or <button>. The target page does not exist at the time of this
 * workpackage. Using a link would be a dead link; using a button would imply
 * an action. The span is a visual affordance only. A TODO marks the upgrade
 * point.
 *
 * @lore L12 (B-4): In "single" layout, items[0] access is guarded by the
 * empty check above the layout branch. If we reach the "single" branch,
 * items.length >= 1 is guaranteed.
 */

import {
	ArtifactGalleryCard,
	ArtifactPreview,
	ArtifactStackItem,
	EmptyState,
	ErrorState,
	SkeletonCard,
	SkeletonList,
} from "@hyperidle/design-system";
import type { Artifact, ArtifactFilterAxis, ArtifactQuery } from "@hyperidle/shared";
import type { JSX } from "react";
import { useNavigate } from "react-router-dom";
import { useArtifacts } from "../hooks/useArtifacts.js";

export type ArtifactSectionLayout = "gallery" | "stack" | "single";

export interface ArtifactSectionProps {
	filter: ArtifactFilterAxis;
	layout: ArtifactSectionLayout;
	limit?: number;
	heading?: string;
	/**
	 * Surface-specific description shown in the empty state. Falls back to a
	 * generic description when not provided.
	 *
	 * @lore L12 review (W-4): each surface has distinct copy per approved design.
	 */
	emptyDescription?: string;
	/**
	 * Called when the user opens an artifact. If not provided, ArtifactSection
	 * navigates to /artifacts/:id using useNavigate internally.
	 *
	 * @lore L12: onOpen is optional so callers (like TaskSheet) don't need to
	 * hold a useNavigate reference — the default behavior is navigate-to-permalink.
	 * Callers that override onOpen can intercept navigation (e.g. for analytics).
	 */
	onOpen?: (artifactId: string) => void;
	/**
	 * AM5 WIRE: Called when "View all" is activated (overflow present, nextCursor !== null).
	 * When not provided, the overflow affordance renders as an inert label.
	 *
	 * @lore AM5 T9: Previously the overflow span was non-interactive (L12 B-3 lore).
	 * The /artifacts/:id route now exists (H5 fix) and can be driven through the open contract.
	 * Callers that know the full-listing context supply this callback.
	 */
	onViewAll?: () => void;
}

/** Number of skeletons to show per layout while loading. */
const SKELETON_COUNT: Record<ArtifactSectionLayout, number> = {
	gallery: 3,
	stack: 2,
	single: 1,
};

export function ArtifactSection({
	filter,
	layout,
	limit,
	heading,
	emptyDescription,
	onOpen,
	onViewAll,
}: ArtifactSectionProps): JSX.Element | null {
	const navigate = useNavigate();
	const query: Pick<ArtifactQuery, "limit"> | undefined =
		limit !== undefined ? { limit } : undefined;
	const { data, error, isLoading } = useArtifacts(filter, query);

	// Default open handler: navigate to /artifacts/:id.
	const handleOpen = onOpen ?? ((id: string) => navigate(`/artifacts/${encodeURIComponent(id)}`));

	// ── Loading ────────────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<section data-testid="artifact-section-container" aria-label={heading ?? "Artifacts"}>
				{heading && (
					<h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
						{heading}
					</h2>
				)}
				{layout === "stack" ? (
					<SkeletonList rows={SKELETON_COUNT.stack} ariaLabel="Loading artifacts" />
				) : (
					<div
						className={
							layout === "gallery"
								? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[12px]"
								: undefined
						}
					>
						{Array.from({ length: SKELETON_COUNT[layout] }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-count skeleton placeholders
							<SkeletonCard key={i} ariaLabel="Loading artifact" />
						))}
					</div>
				)}
			</section>
		);
	}

	// ── Error ──────────────────────────────────────────────────────────────────

	if (error !== null) {
		// @lore L12 review (W-3): collapse entirely when there's no heading and an
		// error occurs — matches the TaskSheet "nothing useful to show" pattern.
		if (!heading) return null;
		return (
			<section data-testid="artifact-section-container" aria-label={heading}>
				<h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					{heading}
				</h2>
				<ErrorState
					title="Failed to load artifacts"
					description="An error occurred while loading artifacts."
				/>
			</section>
		);
	}

	// ── Empty ──────────────────────────────────────────────────────────────────

	if (data === null || !Array.isArray(data.items) || data.items.length === 0) {
		// Without heading: render null (TaskSheet / single layout pattern — no chrome).
		if (!heading) return null;

		return (
			<section data-testid="artifact-section-container" aria-label={heading}>
				<h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					{heading}
				</h2>
				<EmptyState
					title="No artifacts yet"
					description={
						emptyDescription ??
						"Artifacts will appear here once agents produce output for this context."
					}
				/>
			</section>
		);
	}

	// ── Populated ─────────────────────────────────────────────────────────────

	// TypeScript's Array.isArray signature is `(arg: any): arg is any[]`, so the
	// guard above narrows data.items to any[]. The API contract is
	// ArtifactPage.items: ReadonlyArray<Artifact> — restore it explicitly after
	// the runtime guard so map callbacks infer Artifact, not any. (LG1 Phase 3)
	const items = data.items as ReadonlyArray<Artifact>;
	const { nextCursor } = data;

	return (
		<section data-testid="artifact-section-container" aria-label={heading ?? "Artifacts"}>
			{heading && (
				<h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
					{heading}
				</h2>
			)}

			{layout === "gallery" && (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[12px]">
					{items.map((artifact) => (
						<ArtifactGalleryCard
							key={artifact.id}
							data={artifact}
							onOpen={() => handleOpen(artifact.id)}
						/>
					))}
				</div>
			)}

			{layout === "stack" && (
				<div className="flex flex-col">
					{items.map((artifact) => (
						<ArtifactStackItem
							key={artifact.id}
							data={artifact}
							onOpen={() => handleOpen(artifact.id)}
						/>
					))}
				</div>
			)}

			{layout === "single" && (
				// @lore L12 (B-4): items[0] access is guarded by the empty check above.
				// If we reach this branch, items.length >= 1 is guaranteed.
				// noUncheckedIndexedAccess adds | undefined to array[N] — the ! asserts the
				// length guard above makes this defined. (LG1 Phase 3)
				// biome-ignore lint/style/noNonNullAssertion: length guard above
				<ArtifactPreview data={items[0]!} />
			)}

			{/* @lore AM5 T9 (was L12 B-3): wired via onViewAll callback (the /artifacts/:id route
			    now exists via the H5 fix). When onViewAll is provided, renders as a button
			    routed through the open contract; when absent, falls back to an inert label. */}
			{nextCursor !== null &&
				(onViewAll ? (
					<button
						type="button"
						data-testid="artifact-section-view-all"
						onClick={onViewAll}
						className="text-xs text-[var(--text-tertiary)] mt-2 inline-block hover:text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)]"
					>
						View all
					</button>
				) : (
					<span
						data-testid="artifact-section-view-all"
						className="text-xs text-[var(--text-tertiary)] mt-2 inline-block"
					>
						View all
					</span>
				))}
		</section>
	);
}

/**
 * useArtifactOpen — returns an onOpen callback that navigates to /artifacts/:id.
 *
 * @lore L12: all onOpen callbacks navigate to /artifacts/:id using useNavigate.
 * This hook is used by each surface to avoid duplicating the navigate pattern.
 */
export function useArtifactOpen(): (artifactId: string) => void {
	const navigate = useNavigate();
	return (artifactId: string): void => {
		navigate(`/artifacts/${encodeURIComponent(artifactId)}`);
	};
}
