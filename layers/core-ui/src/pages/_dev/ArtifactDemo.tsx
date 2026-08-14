// L3 — Throwaway dev preview rendering all four Artifact layouts.
// AC-10 evidence surface: the permanent product mounts (portfolio gallery,
// bet detail stack, task detail single preview, review thread embed) land
// in L11 / L12. Until then this page proves each layout renders against
// real backend data fetched through `useArtifacts({ axis: 'portfolio' })`.
//
// @lore L3 / L11 / L12: delete this file once production mounts ship and
// the AC-10 e2e suite has been re-pointed at the real surfaces.

import {
	ArtifactEmbed,
	ArtifactGalleryCard,
	ArtifactPreview,
	ArtifactStackItem,
	EmptyState,
	ErrorState,
} from "@hyperidle/design-system";
import type { Artifact } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useArtifacts } from "../../hooks/useArtifacts.js";
import { sanitizeHtml } from "../../utils/sanitize-html.js";

const BANNER =
	"bg-[var(--surface-elevated)] text-[var(--text-secondary)] uppercase rounded-[var(--r-subtle)] px-[12px] py-[8px]";
const SECTION = "flex flex-col gap-[9px]";
const SECTION_LABEL = "uppercase text-[var(--text-tertiary)]";
const GRID = "grid grid-cols-2 gap-[12px]";

function noop(): void {
	// dev preview — open handlers intentionally do nothing.
}

export function ArtifactDemo(): JSX.Element | null {
	const { data, error, isLoading } = useArtifacts({ axis: "portfolio" });

	if (isLoading) {
		return <div className="p-[24px] text-[var(--text-secondary)]">Loading…</div>;
	}
	if (error) {
		return (
			<div className="p-[24px]">
				<ErrorState title="Failed to load artifacts" description={error} />
			</div>
		);
	}
	const items: ReadonlyArray<Artifact> = data?.items ?? [];
	if (items.length === 0) {
		return (
			<div className="p-[24px]">
				<EmptyState
					title="No artifacts"
					description="Seed the dev database to render the four Artifact layouts."
				/>
			</div>
		);
	}

	// Guards: items.length > 0 is proven by the early return above (noUncheckedIndexedAccess).
	const first = items[0];
	if (first === undefined) return null;
	const second = items[1] ?? first;
	return (
		<div className="p-[24px] flex flex-col gap-[24px]">
			<div className={`type-data ${BANNER}`}>
				L3 layout preview — production wiring lands in L11 / L12.
			</div>

			<section className={SECTION}>
				<div className={`type-data ${SECTION_LABEL}`}>Gallery card</div>
				<div className={GRID}>
					{items.slice(0, 4).map((a) => (
						<ArtifactGalleryCard key={a.id} data={a} onOpen={noop} />
					))}
				</div>
			</section>

			<section className={SECTION}>
				<div className={`type-data ${SECTION_LABEL}`}>Stack item</div>
				<div className="flex flex-col gap-[0px]">
					{items.slice(0, 4).map((a) => (
						<ArtifactStackItem key={a.id} data={a} onOpen={noop} />
					))}
				</div>
			</section>

			<section className={SECTION}>
				<div className={`type-data ${SECTION_LABEL}`}>Single full preview</div>
				<ArtifactPreview data={first} sanitizeHtml={sanitizeHtml} />
			</section>

			<section className={SECTION}>
				<div className={`type-data ${SECTION_LABEL}`}>Embed (chrome-less)</div>
				<ArtifactEmbed data={second} onOpen={noop} />
			</section>
		</div>
	);
}
