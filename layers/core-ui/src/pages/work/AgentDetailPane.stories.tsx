/**
 * AV4 — AgentDetailPane stories (design artifacts for the component viewer).
 *
 */

import type { JSX, ReactNode } from "react";
import type { TeamRosterMember } from "../../hooks/useTeam.js";
import type { AgentConfig } from "../../settings/settings-types.js";
import { ToastRegion } from "../../shell/ToastRegion.js";
import { AgentDetailPane } from "./AgentDetailPane.js";

const noop = (): void => {};

function Wrapper({ children }: { children: ReactNode }): JSX.Element {
	return <ToastRegion>{children}</ToastRegion>;
}

const TEAM_AGENT: AgentConfig = {
	id: "agent-builder-1",
	name: "Atlas Builder",
	discipline: "builder",
	identityDocumentId: "ki_af_demo",
	harnessType: "claude-code",
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 2,
	status: "active",
	agentCategory: "team",
};

const INDIVIDUAL_AGENT: AgentConfig = {
	id: "agent-scout-1",
	name: "Scout Agent",
	discipline: "scout",
	identityDocumentId: "ki_af_demo",
	harnessType: null,
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
	status: "active",
	agentCategory: "individual",
};

const TEAM_MEMBER: TeamRosterMember = {
	agentId: "agent-builder-1",
	name: "Atlas Builder",
	discipline: "builder",
	agentCategory: "team",
};

const INDIVIDUAL_MEMBER: TeamRosterMember = {
	agentId: "agent-scout-1",
	name: "Scout Agent",
	discipline: "scout",
	agentCategory: "individual",
};

export default { title: "Page: Work/AgentDetailPane" };

/** Team agent — editable system prompt, config enabled. No role="dialog". */
export const TeamAgent = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<AgentDetailPane
				agent={TEAM_AGENT}
				rosterMember={TEAM_MEMBER}
				onClose={noop}
				onSaved={noop}
			/>
		</div>
	</Wrapper>
);

/** Individual agent — all config fields editable (D5 app-managed lock deleted BA9d). */
export const IndividualAgent = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<AgentDetailPane
				agent={INDIVIDUAL_AGENT}
				rosterMember={INDIVIDUAL_MEMBER}
				onClose={noop}
				onSaved={noop}
			/>
		</div>
	</Wrapper>
);

/** Empty state — no agent selected. */
export const Empty = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<AgentDetailPane agent={null} rosterMember={null} onClose={noop} onSaved={noop} />
		</div>
	</Wrapper>
);
