/**
 * AA2 — RoutineCreateDialog stories.
 * Renders key states for visual verification.
 */

import type { JSX } from "react";
import { RoutineCreateDialog } from "./RoutineCreateDialog.js";

const MOCK_TEAMS = [
	{ id: "team-1", name: "Build Team" },
	{ id: "team-2", name: "Knowledge Fabric" },
];

const MOCK_AGENTS = [
	{ id: "agent-1", name: "Digest Agent" },
	{ id: "agent-2", name: "Review Agent" },
	{ id: "agent-3", name: "Summary Agent" },
];

const noop = (): void => {};

export default { title: "Page: Work/RoutineCreateDialog" };

/** Dialog open with teams and agents loaded. */
export const Open = (): JSX.Element => (
	<RoutineCreateDialog
		open={true}
		onClose={noop}
		onCreated={noop}
		teams={MOCK_TEAMS}
		agents={MOCK_AGENTS}
	/>
);

/** Dialog open with single team (team select hidden). */
export const SingleTeam = (): JSX.Element => (
	<RoutineCreateDialog
		open={true}
		onClose={noop}
		onCreated={noop}
		teams={MOCK_TEAMS[0] ? [MOCK_TEAMS[0]] : []}
		agents={MOCK_AGENTS}
	/>
);

/** Dialog open with no agents available. */
export const NoAgents = (): JSX.Element => (
	<RoutineCreateDialog open={true} onClose={noop} onCreated={noop} teams={MOCK_TEAMS} agents={[]} />
);

/** Dialog closed. */
export const Closed = (): JSX.Element => (
	<RoutineCreateDialog
		open={false}
		onClose={noop}
		onCreated={noop}
		teams={MOCK_TEAMS}
		agents={MOCK_AGENTS}
	/>
);
