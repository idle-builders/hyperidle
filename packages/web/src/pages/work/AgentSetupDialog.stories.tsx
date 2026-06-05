/**
 * AB3 — AgentSetupDialog stories.
 * Renders key wizard states at /designsystem for visual verification.
 */

import type { JSX } from "react";
import { AgentSetupDialog } from "./AgentSetupDialog";

const noop = (): void => {};

const EXISTING_NAMES = ["Atlas", "Nova"];
const TEAM_MEMBERS_ID = "tm-uuid-demo";

export default { title: "Page: Work/AgentSetupDialog" };

/** Dialog open — Step 1: Role selection (no selection yet) */
export const Step1Open = (): JSX.Element => (
	<AgentSetupDialog
		open={true}
		onClose={noop}
		onCreated={noop}
		teamMembersId={TEAM_MEMBERS_ID}
		existingAgentNames={EXISTING_NAMES}
	/>
);

/** Dialog closed */
export const Closed = (): JSX.Element => (
	<AgentSetupDialog
		open={false}
		onClose={noop}
		onCreated={noop}
		teamMembersId={TEAM_MEMBERS_ID}
		existingAgentNames={EXISTING_NAMES}
	/>
);
