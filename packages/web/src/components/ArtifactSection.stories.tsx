/**
 * ArtifactSection stories — L12 artifact view family section wrapper.
 *
 * Each story renders the real `ArtifactSection` component (not raw DS
 * subcomponents) with a fetch override that controls the hook response.
 * This pattern replaces the previous approach of importing DS subcomponents
 * directly, ensuring stories exercise the same code path as production.
 *
 * @lore L12 review (W-5): Stories use a wrapper that overrides globalThis.fetch
 * before mounting ArtifactSection to control which hook state the component
 * renders. This is the "wrapper pattern" — no vi.mock (unavailable in the
 * browser story renderer), no component prop surgery.
 */

import type { ArtifactPage } from "@hyperidle/shared";
import { useEffect, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { ArtifactSection } from "./ArtifactSection.js";

export default { title: "ArtifactSection", tier: "component" as const };

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CODE_DIFF_ARTIFACT = {
	id: "art-story-1",
	producingTaskId: "task-story-1",
	producingTaskTitle: "Build auth service",
	kind: "code_diff" as const,
	preview: {
		kind: "code_diff" as const,
		file: "packages/web/src/auth.ts",
		hunks: [
			{
				header: "@@ -1,2 +1,3 @@",
				lines: [
					{ kind: "ctx" as const, text: "context line" },
					{ kind: "add" as const, text: "+ added auth check" },
				],
			},
		],
	},
	cost: {
		money: { minor: 4, currency: "USD" },
		tokens: { byTier: { haiku: { prompt: 800, completion: 400 } } },
	},
	threadCount: 2,
	createdAt: "2026-05-01T10:00:00.000Z",
};

const DECK_ARTIFACT = {
	...CODE_DIFF_ARTIFACT,
	id: "art-story-2",
	producingTaskId: "task-story-2",
	producingTaskTitle: "Design pitch deck",
	kind: "deck" as const,
	preview: { kind: "deck" as const, slideCount: 8, firstSlideTitle: "Executive summary" },
	cost: {
		money: { minor: 12, currency: "USD" },
		tokens: { byTier: { haiku: { prompt: 5000, completion: 3000 } } },
	},
	threadCount: 0,
};

const CONTRACT_ARTIFACT = {
	...CODE_DIFF_ARTIFACT,
	id: "art-story-3",
	producingTaskId: "task-story-3",
	producingTaskTitle: "Draft contract",
	kind: "contract" as const,
	preview: {
		kind: "contract" as const,
		parties: ["Acme Corp", "HyperIdle"],
		title: "Service Agreement",
	},
	cost: {
		money: { minor: 8, currency: "USD" },
		tokens: { byTier: { haiku: { prompt: 2500, completion: 1500 } } },
	},
	threadCount: 1,
};

const POPULATED_PAGE: ArtifactPage = {
	items: [CODE_DIFF_ARTIFACT, DECK_ARTIFACT, CONTRACT_ARTIFACT],
	nextCursor: null,
};

const POPULATED_PAGE_WITH_CURSOR: ArtifactPage = {
	items: [CODE_DIFF_ARTIFACT, DECK_ARTIFACT],
	nextCursor: "next-page-cursor",
};

const EMPTY_PAGE: ArtifactPage = { items: [], nextCursor: null };

const SINGLE_PAGE: ArtifactPage = { items: [CODE_DIFF_ARTIFACT], nextCursor: null };

// ── Fetch-override wrapper ────────────────────────────────────────────────────

/**
 * Wraps ArtifactSection with a controlled fetch mock. Before mounting the
 * inner component, the wrapper installs a globalThis.fetch override that
 * returns the given response for any /api/artifacts? request. After unmount
 * the real fetch is restored.
 *
 * @lore L12 review (W-5): this is the "wrapper pattern" — it controls hook
 * state without vi.mock (unavailable outside Vitest) or component prop surgery.
 */
function ControlledArtifactSection({
	children,
	fetchResponse,
}: {
	children: React.ReactNode;
	fetchResponse: ArtifactPage | "loading" | "error";
}): React.JSX.Element {
	const [ready, setReady] = useState(fetchResponse === "loading");

	useEffect(() => {
		if (fetchResponse === "loading") {
			// Hang the fetch indefinitely to simulate loading state.
			const original = globalThis.fetch;
			globalThis.fetch = (): Promise<Response> => new Promise(() => {});
			setReady(true);
			return () => {
				globalThis.fetch = original;
			};
		}
		if (fetchResponse === "error") {
			const original = globalThis.fetch;
			globalThis.fetch = (): Promise<Response> =>
				Promise.resolve(new Response(null, { status: 500 }));
			setReady(true);
			return () => {
				globalThis.fetch = original;
			};
		}
		// Populated or empty page response.
		const original = globalThis.fetch;
		globalThis.fetch = (_url: RequestInfo | URL): Promise<Response> =>
			Promise.resolve(new Response(JSON.stringify(fetchResponse), { status: 200 }));
		setReady(true);
		return () => {
			globalThis.fetch = original;
		};
	}, [fetchResponse]);

	if (!ready) return <div />;
	return (
		<MemoryRouter>
			<div className="p-4 bg-[var(--surface-1)]">{children}</div>
		</MemoryRouter>
	);
}

// ── Gallery layout ────────────────────────────────────────────────────────────

export const GalleryLoading = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse="loading">
		<ArtifactSection
			filter={{ axis: "portfolio" }}
			layout="gallery"
			limit={12}
			heading="Artifacts"
			emptyDescription="Artifacts appear here as agents complete tasks."
		/>
	</ControlledArtifactSection>
);

export const GalleryError = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse="error">
		<ArtifactSection
			filter={{ axis: "portfolio" }}
			layout="gallery"
			limit={12}
			heading="Artifacts"
			emptyDescription="Artifacts appear here as agents complete tasks."
		/>
	</ControlledArtifactSection>
);

export const GalleryEmpty = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse={EMPTY_PAGE}>
		<ArtifactSection
			filter={{ axis: "portfolio" }}
			layout="gallery"
			limit={12}
			heading="Artifacts"
			emptyDescription="Artifacts appear here as agents complete tasks."
		/>
	</ControlledArtifactSection>
);

export const GalleryPopulated = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse={POPULATED_PAGE}>
		<ArtifactSection
			filter={{ axis: "portfolio" }}
			layout="gallery"
			limit={12}
			heading="Artifacts"
			emptyDescription="Artifacts appear here as agents complete tasks."
		/>
	</ControlledArtifactSection>
);

export const GalleryWithOverflow = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse={POPULATED_PAGE_WITH_CURSOR}>
		<ArtifactSection
			filter={{ axis: "portfolio" }}
			layout="gallery"
			limit={2}
			heading="Artifacts"
			emptyDescription="Artifacts appear here as agents complete tasks."
		/>
	</ControlledArtifactSection>
);

// ── Stack layout ──────────────────────────────────────────────────────────────

export const StackLoading = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse="loading">
		<ArtifactSection
			filter={{ axis: "product", productId: "prod-story" }}
			layout="stack"
			limit={10}
			heading="Artifacts"
			emptyDescription="Artifacts appear as agents complete tasks for this product."
		/>
	</ControlledArtifactSection>
);

export const StackError = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse="error">
		<ArtifactSection
			filter={{ axis: "product", productId: "prod-story" }}
			layout="stack"
			limit={10}
			heading="Artifacts"
			emptyDescription="Artifacts appear as agents complete tasks for this product."
		/>
	</ControlledArtifactSection>
);

export const StackEmpty = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse={EMPTY_PAGE}>
		<ArtifactSection
			filter={{ axis: "product", productId: "prod-story" }}
			layout="stack"
			limit={10}
			heading="Artifacts"
			emptyDescription="Artifacts appear as agents complete tasks for this product."
		/>
	</ControlledArtifactSection>
);

export const StackPopulated = (): React.JSX.Element => (
	<ControlledArtifactSection
		fetchResponse={{ items: [CODE_DIFF_ARTIFACT, DECK_ARTIFACT], nextCursor: null }}
	>
		<ArtifactSection
			filter={{ axis: "product", productId: "prod-story" }}
			layout="stack"
			limit={10}
			heading="Artifacts"
			emptyDescription="Artifacts appear as agents complete tasks for this product."
		/>
	</ControlledArtifactSection>
);

// ── Single layout ─────────────────────────────────────────────────────────────

export const SingleLoading = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse="loading">
		<ArtifactSection filter={{ axis: "task", taskId: "task-story" }} layout="single" limit={1} />
	</ControlledArtifactSection>
);

export const SingleEmpty = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse={EMPTY_PAGE}>
		{/* No heading → renders null in empty state (TaskSheet pattern). */}
		<ArtifactSection filter={{ axis: "task", taskId: "task-story" }} layout="single" limit={1} />
	</ControlledArtifactSection>
);

export const SinglePopulated = (): React.JSX.Element => (
	<ControlledArtifactSection fetchResponse={SINGLE_PAGE}>
		<ArtifactSection filter={{ axis: "task", taskId: "task-story" }} layout="single" limit={1} />
	</ControlledArtifactSection>
);
