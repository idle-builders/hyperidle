import type React from "react";
import { ToastRegion, useToast } from "./ToastRegion";

export default { title: "ToastRegion", tier: "3" as const, uses: [] };

function Trigger({ message }: { message: string }): React.JSX.Element {
	const { showToast } = useToast();
	return (
		<button
			type="button"
			className="px-[12px] py-[6px] rounded-[var(--r-subtle)] bg-[var(--accent)] text-[var(--accent-on)] text-[13px]"
			onClick={(): void => showToast(message)}
		>
			Fire toast
		</button>
	);
}

export const Default = (): React.JSX.Element => (
	<ToastRegion>
		<div className="p-4">
			<Trigger message="Response recorded — agent will pick it up on next session." />
		</div>
	</ToastRegion>
);

export const ShortMessage = (): React.JSX.Element => (
	<ToastRegion>
		<div className="p-4">
			<Trigger message="Saved." />
		</div>
	</ToastRegion>
);
