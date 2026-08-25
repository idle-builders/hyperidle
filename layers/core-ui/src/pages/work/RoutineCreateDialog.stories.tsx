/**
 * AA2 — RoutineCreateDialog stories.
 * Renders key states for visual verification.
 *
 * @lore BA1 D5: `teams` prop removed — a routine has no team, the agent
 * picker is the only scope input.
 */

import type { JSX } from "react";
import { RoutineCreateDialog } from "./RoutineCreateDialog.js";

const MOCK_AGENTS = [
	{ id: "agent-1", name: "Digest Agent" },
	{ id: "agent-2", name: "Review Agent" },
	{ id: "agent-3", name: "Summary Agent" },
];

const noop = (): void => {};

export default { title: "Page: Work/RoutineCreateDialog" };

/** Dialog open with agents loaded. */
export const Open = (): JSX.Element => (
	<RoutineCreateDialog open={true} onClose={noop} onCreated={noop} agents={MOCK_AGENTS} />
);

/** Dialog open with no agents available. */
export const NoAgents = (): JSX.Element => (
	<RoutineCreateDialog open={true} onClose={noop} onCreated={noop} agents={[]} />
);

/** Dialog closed. */
export const Closed = (): JSX.Element => (
	<RoutineCreateDialog open={false} onClose={noop} onCreated={noop} agents={MOCK_AGENTS} />
);
