/**
 * L9 — ActionSummaryView. Deploy / pricing / email-blast item with an
 * explicit one-shot type-to-confirm guard (L7 pattern, inlined).
 *
 * @lore L9 review (sec CRIT-2 + adv C1): readiness is now lifted up via
 * the `onReadyChange` callback (controlled-up state) so the parent that
 * owns ReviewHeader can gate the Approve button. A disabled-approve
 * gate is authoritative — the renderer's input is the only path to flip
 * readiness on. Visible affordance: input border + readiness text show
 * the gate state to sighted users (W5 design fix).
 */

import { dsShellProps } from "@hyperidle/design-system";
import type { ActionSummaryPayload, ArtifactMetadataExtended } from "@hyperidle/shared";
import { type JSX, useEffect, useState } from "react";
import { ArtifactShell } from "./ArtifactShell.js";

export interface ActionSummaryViewProps {
	metadata: ArtifactMetadataExtended;
	payload: ActionSummaryPayload;
	/**
	 * L9: emitted when the typed token transitions between matching /
	 * not-matching the canonical confirm token. Parent owns the gating of
	 * the Approve button.
	 */
	onReadyChange?: (ready: boolean) => void;
}

export function ActionSummaryView({
	metadata,
	payload,
	onReadyChange,
}: ActionSummaryViewProps): JSX.Element {
	const [confirmInput, setConfirmInput] = useState("");
	const isReady = confirmInput === payload.confirmToken;

	// @lore L9 review: notify parent on every readiness flip. Effect (not
	// inline) so we don't fire onReadyChange during render — useEffect
	// guarantees a stable post-render notification.
	useEffect(() => {
		onReadyChange?.(isReady);
	}, [isReady, onReadyChange]);

	return (
		<div {...dsShellProps("ActionSummaryView")}>
			<ArtifactShell metadata={metadata}>
				<div className="flex flex-col gap-3">
					<p className="text-sm text-[var(--text-hi)]">{payload.summary}</p>

					<dl data-testid="action-summary-impact-list" className="flex flex-col gap-1 text-xs">
						{payload.impactList.map((entry) => (
							<div key={entry.label} className="flex gap-2">
								<dt className="text-[var(--text-lo)] uppercase tracking-wider w-40 shrink-0">
									{entry.label}
								</dt>
								<dd className="text-[var(--text-hi)]">{entry.value}</dd>
							</div>
						))}
					</dl>

					<label className="flex flex-col gap-1 text-xs">
						<span className="text-[var(--text-mid)]">
							{`Type '${payload.confirmToken}' to confirm`}
						</span>
						<input
							data-testid="action-summary-confirm-input"
							type="text"
							value={confirmInput}
							onChange={(e) => setConfirmInput(e.target.value)}
							className={`input input-sm input-bordered text-[length:var(--density-text)] ${
								isReady ? "border-[var(--ok)]" : "border-[var(--border-default)]"
							}`}
							autoComplete="off"
							spellCheck={false}
							aria-describedby="action-summary-confirm-ready"
						/>
						<span
							id="action-summary-confirm-ready"
							data-testid="action-summary-confirm-ready"
							data-confirm-ready={String(isReady)}
							className={`text-xs ${isReady ? "text-[var(--ok)]" : "text-[var(--text-lo)]"}`}
						>
							{isReady
								? "Ready — Approve enabled"
								: `Approve disabled — type '${payload.confirmToken}'`}
						</span>
					</label>
				</div>
			</ArtifactShell>
		</div>
	);
}
