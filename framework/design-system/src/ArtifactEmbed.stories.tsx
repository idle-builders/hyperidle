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
	kind: "text",
	label: "decision",
	preview: { kind: "text", body: "Adopt Hono JWT for stateless auth. Built-in, fast, zero-dep." },
	threadCount: 0,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const InReviewMessage = (): React.JSX.Element => (
	<div className="bg-[var(--surface-elevated)] rounded-[var(--r-subtle)] p-4 max-w-[720px]">
		<p className="mb-2">Here is the diff for review:</p>
		<ArtifactEmbed data={FIXTURE} onOpen={() => undefined} />
		<p className="mt-2">Mostly clean — one nit on naming.</p>
	</div>
);

/**
 * AI6: Arrow button focus ring — `focus-visible:outline-1` with inset offset
 * (`focus-visible:[outline-offset:-1px]`). Converged from `focus:outline-2` (no offset).
 */
export const ArrowFocusState = (): React.JSX.Element => (
	<div className="bg-[var(--surface-elevated)] rounded-[var(--r-subtle)] p-4 max-w-[720px]">
		<p className="text-[11px] text-[var(--text-tertiary)] mb-[6px]">
			Tab to the arrow — 1px inset ring
		</p>
		<ArtifactEmbed data={FIXTURE} onOpen={() => undefined} />
	</div>
);
