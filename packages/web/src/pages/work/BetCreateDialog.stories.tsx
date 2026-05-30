/**
 * Q3 — BetCreateDialog stories.
 * Renders key states at /designsystem for visual verification.
 *
 * @lore U1: Renamed `products` prop → `teams`, `MOCK_PRODUCTS` → `MOCK_TEAMS`.
 */

import type { JSX } from "react";
import { BetCreateDialog } from "./BetCreateDialog";

const MOCK_TEAMS = [
	{ id: "team-1", name: "HyperIdle Core" },
	{ id: "team-2", name: "Knowledge Fabric" },
	{ id: "team-3", name: "Analytics Engine" },
];

const noop = (): void => {};

export default { title: "Page: Work/BetCreateDialog" };

/** Dialog open with teams loaded. */
export const Open = (): JSX.Element => (
	<BetCreateDialog open={true} onClose={noop} onCreated={noop} teams={MOCK_TEAMS} />
);

/** Dialog open with no teams (empty state). */
export const NoTeams = (): JSX.Element => (
	<BetCreateDialog open={true} onClose={noop} onCreated={noop} teams={[]} />
);

/** Dialog closed. */
export const Closed = (): JSX.Element => (
	<BetCreateDialog open={false} onClose={noop} onCreated={noop} teams={MOCK_TEAMS} />
);
