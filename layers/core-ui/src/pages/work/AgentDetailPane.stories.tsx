/**
 * AV4 — AgentDetailPane stories (design artifacts for the component viewer).
 *
 * @lore AV4: Wrapped in <ToastRegion> only — AgentDetailPane uses no router hooks,
 * so no Router ancestor is needed. No <Dialog> shell — no role="dialog" anywhere
 * (AC#3). (The in-app /designsystem viewer was removed in #404; stories render
 * standalone in the component viewer.)
 */

import type { RosterMember } from "@hyperidle/shared";
import type { JSX, ReactNode } from "react";
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
	role: "builder",
	systemPrompt: "You are a meticulous builder who values clean code and thorough documentation.",
	harnessType: "claude-code",
	modelTierPreference: "workhorse",
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 2,
	status: "active",
	agentCategory: "team",
};

const STRATEGY_AGENT: AgentConfig = {
	id: "agent-scout-1",
	name: "Scout Agent",
	role: "scout",
	systemPrompt: null,
	harnessType: null,
	modelTierPreference: null,
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
	status: "active",
	agentCategory: "strategy",
};

const TEAM_MEMBER: RosterMember = {
	agentId: "agent-builder-1",
	name: "Atlas Builder",
	role: "builder",
	isLead: false,
	agentCategory: "team",
};

const STRATEGY_MEMBER: RosterMember = {
	agentId: "agent-scout-1",
	name: "Scout Agent",
	role: "scout",
	isLead: false,
	agentCategory: "strategy",
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

/** Strategy agent — config fields disabled, strategy note visible. */
export const StrategyAgent = (): JSX.Element => (
	<Wrapper>
		<div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
			<AgentDetailPane
				agent={STRATEGY_AGENT}
				rosterMember={STRATEGY_MEMBER}
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
