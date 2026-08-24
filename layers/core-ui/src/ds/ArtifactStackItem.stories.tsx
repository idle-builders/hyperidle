import type { Artifact } from "@hyperidle/domain-model";
import { ArtifactStackItem } from "./ArtifactStackItem.js";

export default {
	title: "ArtifactStackItem",
	tier: "2" as const,
};

const FIXTURE: Artifact = {
	id: "art_1",
	producingTaskId: "task_1",
	producingTaskTitle: "Implement auth flow",
	kind: "code",
	label: null,
	preview: {
		kind: "code",
		path: "src/auth/jwt-middleware.ts",
		lang: "typescript",
		text: "// jwt-middleware",
	},
	threadCount: 3,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const Populated = (): React.JSX.Element => (
	<div className="bg-[var(--surface-elevated)] w-[720px]">
		<ArtifactStackItem data={FIXTURE} onOpen={() => undefined} />
		<ArtifactStackItem
			data={{
				...FIXTURE,
				kind: "text",
				label: "decision",
				preview: { kind: "text", body: "Adopt Hono JWT. Built in, fast, zero deps." },
				threadCount: 0,
			}}
			onOpen={() => undefined}
		/>
	</div>
);

/**
 * AI6: Row focus ring — `focus-visible:outline-1` with inset offset
 * (`focus-visible:[outline-offset:-1px]`). Converged from `focus:outline-2` (no offset).
 * Tab to the row to see the 1px inset ring.
 */
export const FocusState = (): React.JSX.Element => (
	<div className="bg-[var(--surface-elevated)] w-[720px]">
		<ArtifactStackItem data={FIXTURE} onOpen={() => undefined} />
	</div>
);
