/**
 * AB3 — AgentEditDialog stories.
 * Renders key states at /designsystem for visual verification.
 */

import type { JSX } from "react";
import type { AgentConfig } from "../settings/settings-types.js";
import { AgentEditDialog } from "./AgentEditDialog.js";

const noop = (): void => {};

const TEAM_AGENT: AgentConfig = {
	id: "agent-builder-1",
	name: "Atlas Builder",
	role: "builder",
	soulPrompt: "You are a meticulous builder who values clean code and thorough documentation.",
	harnessType: "claude-code",
	modelTierPreference: "workhorse",
	maxConcurrentSessions: 2,
	status: "active",
	activeSessions: 0,
	agentCategory: "team",
};

const STRATEGY_AGENT: AgentConfig = {
	id: "agent-scout-1",
	name: "Scout Agent",
	role: "scout",
	soulPrompt: null,
	harnessType: null,
	modelTierPreference: null,
	maxConcurrentSessions: 1,
	status: "active",
	activeSessions: 0,
	agentCategory: "strategy",
};

export default { title: "Page: Work/AgentEditDialog" };

/** Dialog open for a team agent with soul prompt. */
export const TeamAgent = (): JSX.Element => (
	<AgentEditDialog agent={TEAM_AGENT} rosterMember={null} onClose={noop} onSaved={noop} />
);

/** Dialog open for a strategy agent (shows amber note, config disabled). */
export const StrategyAgent = (): JSX.Element => (
	<AgentEditDialog agent={STRATEGY_AGENT} rosterMember={null} onClose={noop} onSaved={noop} />
);

/** Dialog open for an agent with no soul prompt (shows template button). */
export const NoSoul = (): JSX.Element => (
	<AgentEditDialog
		agent={{ ...TEAM_AGENT, soulPrompt: null }}
		rosterMember={null}
		onClose={noop}
		onSaved={noop}
	/>
);

/** Dialog closed (agent is null). */
export const Closed = (): JSX.Element => (
	<AgentEditDialog agent={null} rosterMember={null} onClose={noop} onSaved={noop} />
);
