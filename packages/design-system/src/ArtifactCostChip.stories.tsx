import { ArtifactCostChip } from "./ArtifactCostChip.js";

export default {
	title: "ArtifactCostChip",
	tier: "1" as const,
};

export const Populated = (): React.JSX.Element => (
	<div className="flex flex-col gap-3">
		<ArtifactCostChip
			cost={{
				money: { minor: 42, currency: "USD" },
				tokens: { byTier: { workhorse: { prompt: 6000, completion: 6400 } } },
			}}
		/>
		<ArtifactCostChip
			cost={{
				money: { minor: 42, currency: "USD" },
				tokens: { byTier: { workhorse: { prompt: 6000, completion: 6400 } } },
			}}
			variant="compact"
		/>
	</div>
);

export const Pending = (): React.JSX.Element => (
	<ArtifactCostChip cost={{ money: null, tokens: null }} />
);

export const PartialPending = (): React.JSX.Element => (
	<ArtifactCostChip
		cost={{
			money: null,
			tokens: { byTier: { workhorse: { prompt: 100, completion: 148 } } },
		}}
	/>
);
