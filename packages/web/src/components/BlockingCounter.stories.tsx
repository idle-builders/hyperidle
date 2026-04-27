import { BlockingCounter } from "./BlockingCounter";

export default {
	title: "BlockingCounter",
	tier: "3" as const,
};

export const NoActiveSelection = (): React.JSX.Element => (
	<BlockingCounter total={5} position={null} />
);

export const ActiveInBlocking = (): React.JSX.Element => <BlockingCounter total={5} position={2} />;

export const ZeroBlocking = (): React.JSX.Element => <BlockingCounter total={0} position={null} />;
