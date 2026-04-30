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
	kind: "drafted_email",
	preview: {
		kind: "drafted_email",
		to: ["a@b.co"],
		subject: "Welcome",
		bodyExcerpt: "Hi there",
	},
	cost: { money: "$0.42", tokens: "12.4k" },
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

export const CostPending = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-4 w-[600px]">
		<ArtifactGalleryCard
			data={{ ...FIXTURE, cost: { money: null, tokens: null } }}
			onOpen={() => undefined}
		/>
	</div>
);

export const Loading = (): React.JSX.Element => (
	<div className="grid grid-cols-2 gap-4 w-[600px]">
		<ArtifactGalleryCard data={FIXTURE} onOpen={() => undefined} state="loading" />
	</div>
);
