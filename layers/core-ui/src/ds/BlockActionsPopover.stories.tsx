import { BlockActionsPopover } from "./BlockActionsPopover.js";

export default {
	title: "BlockActionsPopover",
	tier: "2" as const,
	order: ["Default", "WithDisabledItem"],
};

const noop = (): void => {};

export const Default = (): React.JSX.Element => {
	return (
		<div className="relative">
			<button type="button" aria-controls="popover-default">
				anchor
			</button>
			<BlockActionsPopover
				id="popover-default"
				open={true}
				onClose={noop}
				items={[
					{ id: "copy", label: "Copy permalink", shortcut: "⌘L", onSelect: noop },
					{ id: "threads", label: "View threads", shortcut: "↵", onSelect: noop },
				]}
				liveRegionId="live-default"
			/>
		</div>
	);
};

export const WithDisabledItem = (): React.JSX.Element => {
	return (
		<div className="relative">
			<button type="button" aria-controls="popover-disabled">
				anchor
			</button>
			<BlockActionsPopover
				id="popover-disabled"
				open={true}
				onClose={noop}
				items={[
					{ id: "copy", label: "Copy permalink", shortcut: "⌘L", onSelect: noop },
					{
						id: "edit",
						label: "Suggest edit",
						shortcut: "⌘E",
						disabled: true,
						hint: "read-only",
						onSelect: noop,
					},
				]}
				liveRegionId="live-disabled"
			/>
		</div>
	);
};
