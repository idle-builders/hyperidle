import type { Artifact } from "@hyperidle/domain-model";
import { ArtifactPreview } from "./ArtifactPreview.js";

export default {
	title: "ArtifactPreview",
	tier: "2" as const,
};

const FIXTURE: Artifact = {
	id: "art_01HM",
	producingTaskId: "task_1",
	producingTaskTitle: "Pick auth library",
	kind: "text",
	label: "decision",
	preview: { kind: "text", body: "Adopt Hono JWT for stateless auth. Built in." },
	threadCount: 0,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const Populated = (): React.JSX.Element => (
	<div className="w-[960px]">
		<ArtifactPreview data={FIXTURE} />
	</div>
);

// AM5 K0b — single-representation absence/state ownership. These states belong to the
// SINGLE representation (ArtifactPreview / ArtifactPreviewSurface), NOT to any kind
// renderer. The kind renderer is only ever invoked with present content; "no content",
// "loading", and "error" are gated and rendered here, at the representation.

// "No content" — owned by the single representation. ArtifactPreviewSurface gates
// `preview == null → NoPreviewText` BEFORE invoking the (pure) kind renderer.
export const NoPreview = (): React.JSX.Element => (
	<div className="w-[960px]">
		<ArtifactPreview data={{ ...FIXTURE, preview: null }} state="populated" />
	</div>
);

// "Loading" — owned by the single representation.
export const Loading = (): React.JSX.Element => (
	<div className="w-[960px]">
		<ArtifactPreview data={{ ...FIXTURE, preview: null }} state="loading" />
	</div>
);

// "Error" — owned by the single representation.
export const ErrorState = (): React.JSX.Element => (
	<div className="w-[960px]">
		<ArtifactPreview data={{ ...FIXTURE, preview: null }} state="error" />
	</div>
);
