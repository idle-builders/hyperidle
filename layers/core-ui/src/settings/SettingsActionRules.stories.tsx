/**
 * SettingsActionRules stories — the populated state of the action rules
 * settings section.
 *
 * DESIGN-CLASS = routine (extract). Follows the established Settings-section
 * grammar: an intro lede, a bordered list with hairline dividers, and an
 * inline add-rule form below the list. No new shapes — reuses the same
 * list / form chrome the other settings sections use.
 *
 * Renders only the populated real state. No skeleton or error state in the
 * initial design; those reuse Settings conventions and don't need their own
 * story.
 *
 * @lore BA2 (ruling 1): the empty state (no rules) is the designed starting
 * state. The Populated story shows rules across all three scopes so a
 * reviewer can see the full breadth of the surface.
 */

// hearth-internal-padding

import type { JSX } from "react";
import { Button, Input, Select, Tag } from "../ds";

// ---------------------------------------------------------------------------
// Fixture — three scopes represented
// ---------------------------------------------------------------------------

interface StoryRule {
	id: string;
	pattern: string;
	description: string;
	scope: "global" | "team" | "agent";
	scopeId: string | null;
}

const RULES: StoryRule[] = [
	{
		id: "rule-1",
		pattern: "git push",
		description: "Pushing to remote requires a human to review the diff first.",
		scope: "global",
		scopeId: null,
	},
	{
		id: "rule-2",
		pattern: "deploy",
		description: "Production deploys need explicit sign-off from the infra team.",
		scope: "team",
		scopeId: "team-infra",
	},
	{
		id: "rule-3",
		pattern: "rm -rf",
		description: "Destructive file deletions require human approval for this agent.",
		scope: "agent",
		scopeId: "agent-ops-bot",
	},
];

function scopeLabel(scope: StoryRule["scope"], scopeId: string | null): string {
	if (scope === "global") return "Global";
	if (scope === "team") return `Team: ${scopeId ?? "—"}`;
	return `Agent: ${scopeId ?? "—"}`;
}

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export default {
	title: "SettingsActionRules",
	group: "Settings" as const,
};

export const Populated = (): JSX.Element => (
	<div className="flex flex-col gap-[24px] bg-[var(--surface-page)] p-[24px] max-w-[720px]">
		<p className="type-metadata max-w-[560px] text-[var(--text-tertiary)]">
			Rules mark specific agent actions as requiring a human's approval before the agent may take
			them. The list is empty by default — nothing interrupts an agent until you add a rule.
		</p>

		{/* ── Active rules ──────────────────────────────────────────────── */}
		<div className="flex flex-col gap-[12px]">
			<span className="type-label uppercase text-[var(--text-tertiary)]">Active rules</span>
			<div className="border-width-thin overflow-hidden rounded-[var(--r-default)] border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]">
				{RULES.map((rule, index) => (
					<div key={rule.id}>
						{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
						<div className="flex items-center gap-[12px] px-[12px] py-[12px]">
							<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
								<div className="flex items-center gap-[9px]">
									<span className="type-data truncate text-[var(--text-primary)]">
										{rule.pattern}
									</span>
									<Tag label={scopeLabel(rule.scope, rule.scopeId)} />
								</div>
								<span className="type-metadata text-[var(--text-secondary)]">
									{rule.description}
								</span>
							</div>
							<div className="shrink-0">
								<Button variant="ghost" size="sm" aria-label={`Remove rule: ${rule.pattern}`}>
									Remove
								</Button>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>

		{/* ── Add rule form ──────────────────────────────────────────────── */}
		<div className="flex flex-col gap-[12px]">
			<span className="type-label uppercase text-[var(--text-tertiary)]">Add a rule</span>
			<div className="flex flex-col gap-[9px]">
				<div className="flex gap-[9px]">
					<div className="flex-1">
						<Input label="Pattern" value="" readOnly placeholder="e.g. git push, rm -rf, deploy" />
					</div>
					<div className="w-[140px] shrink-0">
						<Select
							label="Scope"
							value="global"
							onChange={() => {}}
							options={[
								{ value: "global", label: "Global" },
								{ value: "team", label: "Team" },
								{ value: "agent", label: "Agent" },
							]}
						/>
					</div>
				</div>
				<Input
					label="Description"
					value=""
					readOnly
					placeholder="Human-readable label for this rule"
				/>
				<div className="flex justify-end">
					<Button variant="primary" size="sm" disabled>
						Add rule
					</Button>
				</div>
			</div>
		</div>
	</div>
);
Populated.storyName = "Action rules (Settings section)";

export const Empty = (): JSX.Element => (
	<div className="flex flex-col gap-[24px] bg-[var(--surface-page)] p-[24px] max-w-[720px]">
		<p className="type-metadata max-w-[560px] text-[var(--text-tertiary)]">
			Rules mark specific agent actions as requiring a human's approval before the agent may take
			them. The list is empty by default — nothing interrupts an agent until you add a rule.
		</p>
		<div className="flex flex-col gap-[12px]">
			<span className="type-label uppercase text-[var(--text-tertiary)]">Active rules</span>
			<p className="type-metadata text-[var(--text-tertiary)]" data-testid="action-rules-empty">
				No rules defined. Add one below to start gating agent actions.
			</p>
		</div>
		<div className="flex flex-col gap-[12px]">
			<span className="type-label uppercase text-[var(--text-tertiary)]">Add a rule</span>
			<div className="flex flex-col gap-[9px]">
				<div className="flex gap-[9px]">
					<div className="flex-1">
						<Input label="Pattern" value="" readOnly placeholder="e.g. git push, rm -rf, deploy" />
					</div>
					<div className="w-[140px] shrink-0">
						<Select
							label="Scope"
							value="global"
							onChange={() => {}}
							options={[{ value: "global", label: "Global" }]}
						/>
					</div>
				</div>
				<div className="flex justify-end">
					<Button variant="primary" size="sm" disabled>
						Add rule
					</Button>
				</div>
			</div>
		</div>
	</div>
);
Empty.storyName = "Action rules — empty state (fresh install)";
