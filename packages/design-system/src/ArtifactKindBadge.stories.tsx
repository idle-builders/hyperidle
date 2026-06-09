// AE6: ArtifactKindBadge stories updated for 6 fundamental kinds + open vocabulary.

import { ArtifactKindBadge } from "./ArtifactKindBadge.js";

export default {
	title: "ArtifactKindBadge",
	tier: "1" as const,
};

export const FundamentalKinds = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<ArtifactKindBadge kind="text" />
		<ArtifactKindBadge kind="code" />
		<ArtifactKindBadge kind="image" />
		<ArtifactKindBadge kind="data" />
		<ArtifactKindBadge kind="html" />
		<ArtifactKindBadge kind="url" />
	</div>
);

export const CustomKinds = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-3">
		<ArtifactKindBadge kind="blog_post" />
		<ArtifactKindBadge kind="presentation" />
		<ArtifactKindBadge kind="custom_report" />
	</div>
);
