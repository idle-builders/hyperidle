import { ArtifactTimestamp } from "./ArtifactTimestamp.js";

export default {
	title: "ArtifactTimestamp",
	tier: "1" as const,
};

export const Relative = (): React.JSX.Element => (
	<ArtifactTimestamp value={new Date(Date.now() - 12 * 60_000).toISOString()} />
);

export const Absolute = (): React.JSX.Element => (
	<ArtifactTimestamp value="2026-04-28T14:00:00.000Z" format="absolute" />
);
