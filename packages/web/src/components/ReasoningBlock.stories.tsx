import { ReasoningBlock } from "./ReasoningBlock";

export default { title: "ReasoningBlock" };

const sampleSteps = [
	"Surveyed the existing diff rendering pipeline.",
	"Confirmed the acceptance criteria with the track spec.",
	"Wrote a failing unit test capturing the expected output shape.",
	"Implemented the minimum component to pass the test.",
	"Ran the suite and verified no regressions.",
];

export const Collapsed = (): React.JSX.Element => <ReasoningBlock steps={sampleSteps} />;

export const Expanded = (): React.JSX.Element => (
	<ReasoningBlock steps={sampleSteps} defaultOpen={true} />
);

export const SingleStep = (): React.JSX.Element => (
	<ReasoningBlock steps={["The agent found a single cache hit and reused it."]} />
);

export const Empty = (): React.JSX.Element => <ReasoningBlock steps={[]} />;
