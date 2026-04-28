import { ReasoningBlockView } from "./ReasoningBlockView";

export default { title: "ReasoningBlockView", tier: "utility" as const };

const sampleSteps = [
	"Surveyed the existing diff rendering pipeline.",
	"Confirmed the acceptance criteria with the track spec.",
	"Wrote a failing unit test capturing the expected output shape.",
	"Implemented the minimum component to pass the test.",
	"Ran the suite and verified no regressions.",
];

export const Collapsed = (): React.JSX.Element => <ReasoningBlockView steps={sampleSteps} />;

export const Expanded = (): React.JSX.Element => (
	<ReasoningBlockView steps={sampleSteps} defaultOpen={true} />
);

export const SingleStep = (): React.JSX.Element => (
	<ReasoningBlockView steps={["The agent found a single cache hit and reused it."]} />
);

export const Empty = (): React.JSX.Element => <ReasoningBlockView steps={[]} />;
