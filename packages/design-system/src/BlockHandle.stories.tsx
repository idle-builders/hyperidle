import { BlockHandle } from "./BlockHandle.js";

export default {
	title: "BlockHandle",
	tier: "2" as const,
	order: ["Default", "WithThreadCount", "Open"],
};

const noop = (): void => {};

export const Default = (): React.JSX.Element => (
	<BlockHandle
		open={false}
		threadCount={0}
		onOpen={noop}
		onClose={noop}
		onCopyPermalink={noop}
		ariaControls="popover-1"
	/>
);

export const WithThreadCount = (): React.JSX.Element => (
	<BlockHandle
		open={false}
		threadCount={3}
		onOpen={noop}
		onClose={noop}
		onCopyPermalink={noop}
		ariaControls="popover-2"
	/>
);

export const Open = (): React.JSX.Element => (
	<BlockHandle
		open={true}
		threadCount={1}
		onOpen={noop}
		onClose={noop}
		onCopyPermalink={noop}
		ariaControls="popover-3"
	/>
);
