import type { Artifact } from "@hyperidle/shared";
import { ArtifactPreview } from "./ArtifactPreview.js";

export default {
	title: "ArtifactPreview",
	tier: "2" as const,
};

const FIXTURE: Artifact = {
	id: "art_01HM",
	producingTaskId: "task_1",
	producingTaskTitle: "Pick auth library",
	kind: "decision",
	preview: { kind: "decision", claim: "Adopt Hono JWT", rationale: "Built in." },
	cost: { money: "$0.42", tokens: "12.4k" },
	threadCount: 0,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const Populated = (): React.JSX.Element => (
	<div className="w-[960px]">
		<ArtifactPreview data={FIXTURE} />
	</div>
);

export const NoPreview = (): React.JSX.Element => (
	<div className="w-[960px]">
		<ArtifactPreview data={{ ...FIXTURE, preview: null }} />
	</div>
);
