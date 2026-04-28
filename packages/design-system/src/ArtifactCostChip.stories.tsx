import { ArtifactCostChip } from "./ArtifactCostChip.js";

export default {
	title: "ArtifactCostChip",
	tier: "1" as const,
};

export const Populated = (): React.JSX.Element => (
	<div className="flex flex-col gap-3">
		<ArtifactCostChip cost={{ money: "$0.42", tokens: "12.4k" }} />
		<ArtifactCostChip cost={{ money: "$0.42", tokens: "12.4k" }} variant="compact" />
	</div>
);

export const Pending = (): React.JSX.Element => (
	<ArtifactCostChip cost={{ money: null, tokens: null }} />
);

export const PartialPending = (): React.JSX.Element => (
	<ArtifactCostChip cost={{ money: null, tokens: "248" }} />
);
