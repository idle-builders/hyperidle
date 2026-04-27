/**
 * L9 — PermissionRequestView. Renders an autonomy-raise request and exposes
 * Approve once / Raise level / Deny + reason verdict-variant labels via
 * `getVerdictVariants`.
 *
 * @lore L9 AC: 'Approve once' is render-only — the underlying VerdictAction
 * stays `approve`. The 'one-shot grant' semantics live at the API/audit
 * boundary (responses.view + feedback), not in this renderer.
 */

import { dsShellProps } from "@hyperidle/design-system";
import type {
	ArtifactMetadataExtended,
	AutonomyLevel,
	PermissionRequestPayload,
	VerdictVariants,
} from "@hyperidle/shared";
import { AUTONOMY_LEVEL_META } from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactShell } from "./ArtifactShell.js";

const AUTONOMY_LEVELS: AutonomyLevel[] = [1, 2, 3, 4];

export interface PermissionRequestViewProps {
	metadata: ArtifactMetadataExtended;
	payload: PermissionRequestPayload;
}

export function getVerdictVariants(): VerdictVariants {
	return {
		approve: "Approve once",
		requestChanges: "Raise level",
		reject: "Deny + reason",
	};
}

export function PermissionRequestView({
	metadata,
	payload,
}: PermissionRequestViewProps): JSX.Element {
	const minLevel = Math.min(payload.currentLevel, payload.requestedLevel);
	const maxLevel = Math.max(payload.currentLevel, payload.requestedLevel);

	return (
		<div {...dsShellProps("PermissionRequestView")}>
			<ArtifactShell metadata={metadata}>
				<div className="flex flex-col gap-3">
					<dl className="flex flex-col gap-1 text-sm">
						<div className="flex gap-2">
							<dt className="text-[var(--text-lo)] uppercase tracking-wider w-24 shrink-0">
								Agent
							</dt>
							<dd className="text-[var(--text-hi)]">{payload.requesterAgentName}</dd>
						</div>
						<div className="flex gap-2">
							<dt className="text-[var(--text-lo)] uppercase tracking-wider w-24 shrink-0">
								Skill
							</dt>
							<dd className="text-[var(--text-hi)] font-mono text-xs">
								<code title={`Skill ${payload.skillId}`}>{payload.skillId}</code>
							</dd>
						</div>
					</dl>

					{/*
					  @lore L9 review (design W1): L1→L4 ladder. All four
					  autonomy levels render as a horizontal stepper so the
					  founder reads the *magnitude* of the trust jump
					  (L2→L3 vs L1→L4 are different decisions). The current
					  level is filled, the requested level is outlined, and
					  in-between levels are shown as muted markers. Steps
					  outside [min, max] are inert visual context.
					*/}
					<ol
						data-testid="perm-req-autonomy-ladder"
						aria-label="Autonomy level progression"
						className="flex items-stretch gap-2"
					>
						{AUTONOMY_LEVELS.map((level) => {
							const meta = AUTONOMY_LEVEL_META[level];
							const isCurrent = level === payload.currentLevel;
							const isRequested = level === payload.requestedLevel;
							const inRange = level >= minLevel && level <= maxLevel;
							const stepClass = isCurrent
								? "border-[var(--border-emphasis)] bg-[var(--surface-3)] text-[var(--text-hi)]"
								: isRequested
									? "border-[var(--danger)] text-[var(--danger)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]"
									: inRange
										? "border-[var(--border-default)] text-[var(--text-mid)]"
										: "border-[var(--border-subtle)] text-[var(--text-lo)]";
							const stateLabel = isCurrent
								? "current"
								: isRequested
									? "requested"
									: inRange
										? "intermediate"
										: "inactive";
							return (
								<li
									key={level}
									data-level={level}
									data-state={stateLabel}
									data-testid={
										isCurrent
											? "perm-req-current-level"
											: isRequested
												? "perm-req-requested-level"
												: undefined
									}
									className={`flex flex-1 flex-col gap-0.5 border p-2 ${stepClass}`}
								>
									<span className="text-xs uppercase tracking-wider">
										{`${meta.code}${isCurrent ? " — current" : isRequested ? " — requested" : ""}`}
									</span>
									<span className="text-sm">{meta.label}</span>
								</li>
							);
						})}
					</ol>

					<section aria-label="Justification" className="flex flex-col gap-1">
						<h4 className="text-xs uppercase tracking-wider text-[var(--text-lo)]">
							Justification
						</h4>
						<p className="text-sm text-[var(--text-hi)]">{payload.justification}</p>
					</section>
				</div>
			</ArtifactShell>
		</div>
	);
}
