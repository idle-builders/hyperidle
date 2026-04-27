/**
 * L9 — SkillChangeView. Diff + per-agent impact list + rollout-policy gate.
 * DOM order MUST be diff → impact list → rollout gate so the AC for
 * "per-agent impact list above verdict bar" can be verified via
 * `compareDocumentPosition`.
 */

import { dsShellProps } from "@hyperidle/design-system";
import type { ArtifactMetadataExtended, SkillChangePayload } from "@hyperidle/shared";
import { type JSX, useEffect, useState } from "react";
import { ArtifactShell } from "./ArtifactShell.js";

export interface SkillChangeViewProps {
	metadata: ArtifactMetadataExtended;
	payload: SkillChangePayload;
	onRolloutChange?: (policy: { mode: "pin_version" | "rollback_window"; value: string }) => void;
}

export function SkillChangeView({
	metadata,
	payload,
	onRolloutChange,
}: SkillChangeViewProps): JSX.Element {
	const [policy, setPolicy] = useState<SkillChangePayload["rolloutPolicy"]>(payload.rolloutPolicy);
	const isReady = policy !== null;

	// @lore L9 review (adv W2): if the payload swaps mid-mount (thread
	// switch), reset the local policy state to match the new prop so the
	// gate is correct on first render after the swap.
	useEffect(() => {
		setPolicy(payload.rolloutPolicy);
	}, [payload.rolloutPolicy]);

	function selectPin(): void {
		const next = { mode: "pin_version" as const, value: "current" };
		setPolicy(next);
		onRolloutChange?.(next);
	}

	function selectRollback(): void {
		const next = { mode: "rollback_window" as const, value: "24h" };
		setPolicy(next);
		onRolloutChange?.(next);
	}

	return (
		<div {...dsShellProps("SkillChangeView")}>
			<ArtifactShell metadata={metadata}>
				<div className="flex flex-col gap-3">
					<section
						data-testid="skill-change-diff"
						aria-label="Skill diff"
						className="flex flex-col gap-1 text-xs font-mono"
					>
						{/*
						  @lore L9 review (design C2): canonical tokens are
						  `--danger` and `--ok`. Earlier code used non-existent
						  `--error`/`--success`, collapsing the diff into plain
						  prose. Per Lucid monochrome philosophy, the `-` row
						  uses the only chromatic accent (`--danger`); the `+`
						  row stays in the gray ramp (`--ok`).
						*/}
						<div className="px-2 py-1 bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] border-l-2 border-[var(--danger)]">
							<span className="select-none text-[var(--danger)] mr-2 inline-block w-4 text-right">
								-
							</span>
							<code>{payload.diff.before}</code>
						</div>
						<div className="px-2 py-1 bg-[color-mix(in_oklab,var(--ok)_12%,transparent)] border-l-2 border-[var(--ok)]">
							<span className="select-none text-[var(--ok)] mr-2 inline-block w-4 text-right">
								+
							</span>
							<code>{payload.diff.after}</code>
						</div>
					</section>

					<section aria-label="Per-agent impact" className="flex flex-col gap-1">
						<h4 className="text-xs uppercase tracking-wider text-[var(--text-lo)]">
							Per-agent impact
						</h4>
						<ul data-testid="skill-change-impact-list" className="flex flex-col gap-1 text-sm">
							{payload.agentImpacts.map((entry) => (
								<li key={entry.agentName} className="flex gap-2">
									<span className="text-[var(--text-hi)] w-32 shrink-0">{entry.agentName}</span>
									<span className="text-[var(--text-mid)]">{entry.behaviorChange}</span>
								</li>
							))}
						</ul>
					</section>

					<fieldset
						data-testid="skill-change-rollout-gate"
						aria-disabled={isReady ? "false" : "true"}
						className="flex flex-col gap-1 border border-[var(--border-subtle)] p-2"
					>
						<legend className="text-xs uppercase tracking-wider text-[var(--text-lo)] px-1">
							Rollout policy
						</legend>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="radio"
								name="rollout"
								className="radio radio-sm"
								checked={policy?.mode === "pin_version"}
								onChange={selectPin}
								aria-label="Pin to version"
							/>
							<span>Pin to version (current)</span>
						</label>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="radio"
								name="rollout"
								className="radio radio-sm"
								checked={policy?.mode === "rollback_window"}
								onChange={selectRollback}
								aria-label="Rollback window"
							/>
							<span>Rollback window (24h)</span>
						</label>
						{!isReady && (
							<p className="text-xs text-[var(--warn)]">
								Approve disabled until rollout policy selected.
							</p>
						)}
					</fieldset>
				</div>
			</ArtifactShell>
		</div>
	);
}
