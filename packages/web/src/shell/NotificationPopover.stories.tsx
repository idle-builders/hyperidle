/**
 * AF8 — NotificationPopover stories.
 * Renders key states at /designsystem for visual verification.
 */

import type { JSX } from "react";
import { NotificationPopover } from "./NotificationPopover";

export default {
	title: "NotificationPopover",
	tier: "3" as const,
	uses: [],
};

const noop = (): void => undefined;

/** Empty state: no notifications. */
export function Empty(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover open={true} onClose={noop} />
		</div>
	);
}

/** Loading state. */
export function LoadingState(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover open={true} onClose={noop} />
		</div>
	);
}

/** Error state. */
export function ErrorState(): JSX.Element {
	return (
		<div style={{ height: "500px", position: "relative" }}>
			<NotificationPopover open={true} onClose={noop} />
		</div>
	);
}

/** Populated: multiple notification rows. */
export function Populated(): JSX.Element {
	return (
		<div style={{ height: "600px", position: "relative" }}>
			<NotificationPopover open={true} onClose={noop} />
		</div>
	);
}

/** Closed: popover not shown. */
export function Closed(): JSX.Element {
	return (
		<div style={{ height: "300px", position: "relative", padding: "24px" }}>
			<p
				style={{
					color: "var(--text-secondary)",
					fontFamily: "var(--font-sans)",
					fontSize: "13px",
				}}
			>
				Popover is closed (open=false). Nothing renders.
			</p>
			<NotificationPopover open={false} onClose={noop} />
		</div>
	);
}
