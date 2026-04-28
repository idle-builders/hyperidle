import { ArtifactKindBadge } from "./ArtifactKindBadge.js";

export default {
	title: "ArtifactKindBadge",
	tier: "1" as const,
};

export const All = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<ArtifactKindBadge kind="code_diff" />
		<ArtifactKindBadge kind="deck" />
		<ArtifactKindBadge kind="drafted_email" />
		<ArtifactKindBadge kind="design" />
		<ArtifactKindBadge kind="decision" />
		<ArtifactKindBadge kind="unknown_kind" />
	</div>
);
