/**
 * AB3 — AgentEditDialog stories.
 * Renders key states for visual verification.
 *
 * @lore AB3: Wrapped in <ToastRegion> because AgentEditDialog calls useToast().
 * The story viewer does not provide <ToastRegion>, so stories that render
 * dialogs must add their own wrapper to avoid a runtime crash.
 */

import type { JSX, ReactNode } from "react";
import type { AgentConfig } from "../settings/settings-types.js";
import { ToastRegion } from "../shell/ToastRegion.js";
import { AgentEditDialog } from "./AgentEditDialog.js";

const noop = (): void => {};

function WithToast({ children }: { children: ReactNode }): JSX.Element {
	return <ToastRegion>{children}</ToastRegion>;
}

const TEAM_AGENT: AgentConfig = {
	id: "agent-builder-1",
	name: "Atlas Builder",
	role: "builder",
	systemPrompt: "You are a meticulous builder who values clean code and thorough documentation.",
	harnessType: "claude-code",
	modelTierPreference: "workhorse",
	// AH2: per-agent model fields
	modelId: "claude-sonnet-4-6",
	modelProvider: "anthropic",
	maxConcurrentSessions: 2,
	status: "active",
	activeSessions: 0,
	agentCategory: "team",
};

const STRATEGY_AGENT: AgentConfig = {
	id: "agent-scout-1",
	name: "Scout Agent",
	role: "scout",
	systemPrompt: null,
	harnessType: null,
	modelTierPreference: null,
	// AH2: per-agent model fields
	modelId: null,
	modelProvider: null,
	maxConcurrentSessions: 1,
	status: "active",
	activeSessions: 0,
	agentCategory: "strategy",
};

export default { title: "Page: Work/AgentEditDialog" };

/** Dialog open for a team agent with system prompt. */
export const TeamAgent = (): JSX.Element => (
	<WithToast>
		<AgentEditDialog agent={TEAM_AGENT} rosterMember={null} onClose={noop} onSaved={noop} />
	</WithToast>
);

/** Dialog open for a strategy agent (shows amber note, config disabled). */
export const StrategyAgent = (): JSX.Element => (
	<WithToast>
		<AgentEditDialog agent={STRATEGY_AGENT} rosterMember={null} onClose={noop} onSaved={noop} />
	</WithToast>
);

/** Dialog open for an agent with no system prompt (shows template button). */
export const NoSoul = (): JSX.Element => (
	<WithToast>
		<AgentEditDialog
			agent={{ ...TEAM_AGENT, systemPrompt: null }}
			rosterMember={null}
			onClose={noop}
			onSaved={noop}
		/>
	</WithToast>
);

/** Dialog closed (agent is null). */
export const Closed = (): JSX.Element => (
	<WithToast>
		<AgentEditDialog agent={null} rosterMember={null} onClose={noop} onSaved={noop} />
	</WithToast>
);
