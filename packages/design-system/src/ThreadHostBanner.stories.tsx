/**
 * L1a — `ThreadHostBanner` stories (stub).
 *
 * Stub during the TDD red-phase. Each variant tries to render the
 * (throwing) component; the stories index file uses `import.meta.glob`
 * so as long as the file exports a default + named exports with the
 * required shape, the catalog tile registers. The actual rendering
 * fails until the green phase replaces ThreadHostBanner's body.
 */

import { ThreadHostBanner } from "./ThreadHostBanner.js";

export default {
	title: "ThreadHostBanner",
	tier: "3" as const,
	order: ["Default", "Blocking", "Resolved", "Pinned", "Overflow"],
};

const baseProps = {
	hostKind: "bet" as const,
	hostTitle: "Pricing overhaul",
	hostHref: "/work/bet/bet-1",
	blocking: false,
	resolved: false,
	pinned: false,
	participants: [
		{ id: "u-1", name: "Alex" },
		{ id: "u-2", name: "Bea" },
	],
};

export const Default = (): React.JSX.Element => <ThreadHostBanner {...baseProps} />;
export const Blocking = (): React.JSX.Element => (
	<ThreadHostBanner {...baseProps} blocking={true} />
);
export const Resolved = (): React.JSX.Element => (
	<ThreadHostBanner {...baseProps} resolved={true} />
);
export const Pinned = (): React.JSX.Element => <ThreadHostBanner {...baseProps} pinned={true} />;
export const Overflow = (): React.JSX.Element => (
	<ThreadHostBanner
		{...baseProps}
		participants={[
			{ id: "u-1", name: "A" },
			{ id: "u-2", name: "B" },
			{ id: "u-3", name: "C" },
			{ id: "u-4", name: "D" },
			{ id: "u-5", name: "E" },
		]}
	/>
);
