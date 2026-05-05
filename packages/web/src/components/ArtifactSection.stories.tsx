/**
 * ArtifactSection stories — L12 artifact view family section wrapper.
 *
 * Shows all states (loading, error, empty, populated) across all three layouts
 * (gallery, stack, single). Stories use controlled mocks — no real fetch calls.
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
import type { Artifact } from "@hyperidle/shared";
import { MemoryRouter } from "react-router-dom";

export default { title: "ArtifactSection", tier: "component" as const };

const MOCK_ARTIFACT: Artifact = {
	id: "art-story-1",
	producingTaskId: "task-story-1",
	producingTaskTitle: "Build auth service",
	kind: "code_diff",
	preview: {
		kind: "code_diff",
		file: "packages/web/src/auth.ts",
		hunks: [
			{
				header: "@@ -1,2 +1,3 @@",
				lines: [
					{ kind: "ctx", text: "context line" },
					{ kind: "add", text: "+ added auth check" },
				],
			},
		],
	},
	cost: { money: "$0.04", tokens: "1.2k" },
	threadCount: 2,
	createdAt: "2026-05-01T10:00:00.000Z",
};

const MOCK_ARTIFACT_2: Artifact = {
	...MOCK_ARTIFACT,
	id: "art-story-2",
	producingTaskId: "task-story-2",
	producingTaskTitle: "Design pitch deck",
	kind: "deck",
	preview: { kind: "deck", slideCount: 8, firstSlideTitle: "Executive summary" },
	cost: { money: "$0.12", tokens: "8k" },
	threadCount: 0,
};

const MOCK_ARTIFACT_3: Artifact = {
	...MOCK_ARTIFACT,
	id: "art-story-3",
	producingTaskId: "task-story-3",
	producingTaskTitle: "Draft contract",
	kind: "contract",
	preview: { kind: "contract", parties: ["Acme Corp", "HyperIdle"], title: "Service Agreement" },
	cost: { money: "$0.08", tokens: "4k" },
	threadCount: 1,
};

const SECTION_HEADING =
	"text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-lo)] mb-2";

// ── Loading ───────────────────────────────────────────────────────────────────

export const GalleryLoading = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
				<SkeletonCard ariaLabel="Loading artifact" />
				<SkeletonCard ariaLabel="Loading artifact" />
				<SkeletonCard ariaLabel="Loading artifact" />
			</div>
		</section>
	</MemoryRouter>
);

export const StackLoading = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<SkeletonList rows={2} ariaLabel="Loading artifacts" />
		</section>
	</MemoryRouter>
);

export const SingleLoading = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<SkeletonCard ariaLabel="Loading artifact" />
		</section>
	</MemoryRouter>
);

// ── Error ─────────────────────────────────────────────────────────────────────

export const GalleryError = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<ErrorState
				title="Failed to load artifacts"
				description="An error occurred while loading artifacts."
			/>
		</section>
	</MemoryRouter>
);

// ── Empty ─────────────────────────────────────────────────────────────────────

export const GalleryEmpty = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<EmptyState
				title="No artifacts yet"
				description="Artifacts will appear here once agents produce output for this context."
			/>
		</section>
	</MemoryRouter>
);

// ── Gallery (populated) ───────────────────────────────────────────────────────

export const GalleryPopulated = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
				{[MOCK_ARTIFACT, MOCK_ARTIFACT_2, MOCK_ARTIFACT_3].map((artifact) => (
					<ArtifactGalleryCard key={artifact.id} data={artifact} onOpen={() => undefined} />
				))}
			</div>
		</section>
	</MemoryRouter>
);

// ── Gallery with overflow ─────────────────────────────────────────────────────

export const GalleryWithOverflow = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--density-gap)]">
				{[MOCK_ARTIFACT, MOCK_ARTIFACT_2, MOCK_ARTIFACT_3].map((artifact) => (
					<ArtifactGalleryCard key={artifact.id} data={artifact} onOpen={() => undefined} />
				))}
			</div>
			{/* @lore L12 (B-3): non-interactive — target page doesn't exist yet */}
			<span
				data-testid="artifact-section-view-all"
				className="text-xs text-[var(--text-lo)] mt-2 inline-block"
			>
				View all
			</span>
		</section>
	</MemoryRouter>
);

// ── Stack (populated) ─────────────────────────────────────────────────────────

export const StackPopulated = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<h2 className={SECTION_HEADING}>Artifacts</h2>
			<div className="flex flex-col">
				{[MOCK_ARTIFACT, MOCK_ARTIFACT_2].map((artifact) => (
					<ArtifactStackItem key={artifact.id} data={artifact} onOpen={() => undefined} />
				))}
			</div>
		</section>
	</MemoryRouter>
);

// ── Single (populated) ────────────────────────────────────────────────────────

export const SinglePopulated = (): React.JSX.Element => (
	<MemoryRouter>
		<section aria-label="Artifacts">
			<ArtifactPreview data={MOCK_ARTIFACT} />
		</section>
	</MemoryRouter>
);
