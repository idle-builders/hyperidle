import type { Artifact } from "@hyperidle/shared";
import { ArtifactEmbed } from "./ArtifactEmbed.js";

export default {
	title: "ArtifactEmbed",
	tier: "2" as const,
};

const FIXTURE: Artifact = {
	id: "art_1",
	producingTaskId: "task_1",
	producingTaskTitle: "Implement auth flow",
	kind: "decision",
	preview: { kind: "decision", claim: "Ship X", rationale: "y" },
	cost: {
		money: { minor: 42, currency: "USD" },
		tokens: { byTier: { haiku: { prompt: 8000, completion: 4400 } } },
	},
	threadCount: 0,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const InReviewMessage = (): React.JSX.Element => (
	<div className="bg-[var(--surface-2)] rounded-[var(--r1)] p-4 max-w-[720px]">
		<p className="mb-2">Here is the diff for review:</p>
		<ArtifactEmbed data={FIXTURE} onOpen={() => undefined} />
		<p className="mt-2">Mostly clean — one nit on naming.</p>
	</div>
);
