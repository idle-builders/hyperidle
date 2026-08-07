import type { Artifact } from "@hyperidle/shared";
import { ArtifactGalleryCard } from "./ArtifactGalleryCard.js";

export default {
	title: "ArtifactGalleryCard",
	tier: "2" as const,
};

const FIXTURE: Artifact = {
	id: "art_1",
	producingTaskId: "task_1",
	producingTaskTitle: "Implement auth flow",
	kind: "text",
	label: "email",
	preview: {
		kind: "text",
		body: "Hi there,\n\nWelcome to the platform! We're excited to have you.\n\nBest,\nThe Team",
	},
	threadCount: 3,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const Populated = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-4 w-[600px]">
		<ArtifactGalleryCard data={FIXTURE} onOpen={() => undefined} />
	</div>
);

export const NoPreview = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-4 w-[600px]">
		<ArtifactGalleryCard data={{ ...FIXTURE, preview: null }} onOpen={() => undefined} />
	</div>
);

export const Loading = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-4 w-[600px]">
		<ArtifactGalleryCard data={FIXTURE} onOpen={() => undefined} state="loading" />
	</div>
);

/**
 * AI6: Card focus ring — `focus-visible:outline-1` (converged from `focus:outline-2`).
 * Tab to the card to see the 1px ring.
 */
export const FocusState = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-4 w-[600px]">
		<ArtifactGalleryCard data={FIXTURE} onOpen={() => undefined} />
	</div>
);
