import type { Artifact } from "@hyperidle/shared";
import { ArtifactStackItem } from "./ArtifactStackItem.js";

export default {
	title: "ArtifactStackItem",
	tier: "2" as const,
};

const FIXTURE: Artifact = {
	id: "art_1",
	producingTaskId: "task_1",
	producingTaskTitle: "Implement auth flow",
	kind: "code_diff",
	preview: { kind: "code_diff", file: "src/auth/jwt-middleware.ts", hunks: [] },
	cost: {
		money: { minor: 42, currency: "USD" },
		tokens: { byTier: { haiku: { prompt: 8000, completion: 4400 } } },
	},
	threadCount: 3,
	createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
};

export const Populated = (): React.JSX.Element => (
	<div className="bg-[var(--surface-2)] w-[720px]">
		<ArtifactStackItem data={FIXTURE} onOpen={() => undefined} />
		<ArtifactStackItem
			data={{
				...FIXTURE,
				kind: "decision",
				preview: { kind: "decision", claim: "Adopt Hono JWT", rationale: "x" },
				cost: { money: null, tokens: null },
				threadCount: 0,
			}}
			onOpen={() => undefined}
		/>
	</div>
);
