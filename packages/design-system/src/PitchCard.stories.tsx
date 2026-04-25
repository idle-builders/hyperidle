import { PitchCard } from "./PitchCard";

export default { title: "PitchCard", order: ["Shaped", "WithKind", "Killed"] };

export const Shaped = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<PitchCard
			title="AI-Powered Onboarding"
			hypothesis="Reducing onboarding steps from 8 to 3 will increase activation by 40%"
			proposer="Alice Chen"
			status="shaped"
			appetite="2 weeks"
		/>
	</div>
);

export const WithKind = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<PitchCard
			title="Cost Prediction Model"
			hypothesis="ML-based cost prediction will reduce overruns by 60%"
			proposer="Bob Smith"
			status="committed"
			appetite="4 weeks"
			kind="exploration"
		/>
	</div>
);

export const Killed = (): React.JSX.Element => (
	<div className="max-w-[320px]">
		<PitchCard
			title="Deprecated Approach"
			hypothesis="This approach was superseded by a better one"
			proposer="Carol Davis"
			status="killed"
			appetite="1 week"
			kind="feature"
		/>
	</div>
);
