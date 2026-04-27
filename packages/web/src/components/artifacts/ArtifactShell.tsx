/**
 * L9 — ArtifactShell. Shared wrapper that renders the extended metadata
 * strip exactly once per artifact view; kind-specific body is `children`.
 *
 * @lore L9: distinct testid `artifact-metadata-strip-v2` keeps the L9 strip
 * separate from the J4 `artifact-metadata-strip` so visual regressions on
 * either surface don't bleed across.
 */

import { dsShellProps } from "@hyperidle/design-system";
import type { ArtifactMetadataExtended } from "@hyperidle/shared";
import { type JSX, type ReactNode, useState } from "react";

interface ArtifactShellProps {
	metadata: ArtifactMetadataExtended;
	children: ReactNode;
}

function blastRadiusSummary(blast: ArtifactMetadataExtended["blastRadius"]): {
	hasAny: boolean;
	short: string;
} {
	const agentCount = blast.agents.length;
	const teamCount = blast.teams.length;
	const productCount = blast.products.length;
	const hasAny = agentCount + teamCount + productCount > 0;
	const parts: string[] = [];
	if (agentCount > 0) parts.push(`${agentCount} agent${agentCount === 1 ? "" : "s"}`);
	if (teamCount > 0) parts.push(`${teamCount} team${teamCount === 1 ? "" : "s"}`);
	if (productCount > 0) parts.push(`${productCount} product${productCount === 1 ? "" : "s"}`);
	return { hasAny, short: parts.join(", ") };
}

// @lore L9 review (design C1): tokens canonical in tokens.css are
// `--warn` (gray), `--ok` (gray), `--danger` (red). Earlier code used
// non-existent `--warning`/`--error` which silently rendered without
// color, collapsing CRITICAL into HIGH. The Lucid monochrome philosophy:
// only `--danger` carries chromatic accent. CRITICAL gets a red fill +
// border to actually scream; medium/high stay in the gray ramp.
const RISK_CLASS: Record<ArtifactMetadataExtended["riskTier"], string> = {
	low: "border-[var(--border-default)] text-[var(--text-mid)]",
	medium: "border-[var(--warn)] text-[var(--warn)]",
	high: "border-[var(--border-emphasis)] text-[var(--text-hi)] tracking-wider",
	critical:
		"border-[var(--danger)] text-[var(--danger)] bg-[color-mix(in_oklab,var(--danger)_16%,transparent)]",
};

const SANDBOX_CLASS: Record<NonNullable<ArtifactMetadataExtended["sandboxResult"]>, string> = {
	passed: "border-[var(--border-default)] text-[var(--text-mid)]",
	failed: "border-[var(--danger)] text-[var(--danger)]",
	"n/a": "border-[var(--border-default)] text-[var(--text-lo)]",
};

export function ArtifactShell({ metadata, children }: ArtifactShellProps): JSX.Element {
	const reversibleLabel = metadata.reversibility ? "Reversible" : "Irreversible";
	const [blastExpanded, setBlastExpanded] = useState(false);
	const blast = blastRadiusSummary(metadata.blastRadius);

	return (
		<div {...dsShellProps("ArtifactShell")}>
			<div
				data-testid="artifact-metadata-strip-v2"
				className="flex flex-wrap items-center gap-2 px-3 py-1 text-xs font-mono border-b border-[var(--border-subtle)] text-[var(--text-mid)]"
			>
				<span
					data-testid="artifact-kind-badge"
					className="badge badge-sm badge-outline uppercase tracking-wider"
				>
					{metadata.kind.toUpperCase()}
				</span>
				<span
					data-testid="artifact-risk-badge"
					data-risk={metadata.riskTier}
					className={`badge badge-sm badge-outline ${RISK_CLASS[metadata.riskTier]}`}
				>
					{metadata.riskTier.toUpperCase()}
				</span>
				<span
					data-testid="artifact-reversibility"
					data-reversible={String(metadata.reversibility)}
					className="badge badge-sm badge-ghost"
				>
					{reversibleLabel}
				</span>
				{metadata.costEstimate !== null && (
					<span
						data-testid="artifact-cost"
						className="badge badge-sm badge-ghost"
						style={{ fontVariantNumeric: "tabular-nums" }}
					>
						{`$${metadata.costEstimate}`}
					</span>
				)}
				{metadata.sla && (
					<>
						<span className="text-[var(--text-lo)]">sla</span>
						<span data-testid="artifact-sla" className="text-[var(--text-hi)]">
							{metadata.sla}
						</span>
					</>
				)}
				{metadata.routing && (
					<>
						<span className="text-[var(--text-lo)] ml-auto">routing</span>
						<span data-testid="artifact-routing" className="text-[var(--text-hi)]">
							{metadata.routing}
						</span>
					</>
				)}
				{metadata.sandboxResult !== null && (
					<span
						data-testid="artifact-sandbox"
						data-sandbox={metadata.sandboxResult}
						className={`badge badge-sm badge-outline ${SANDBOX_CLASS[metadata.sandboxResult]}`}
					>
						{`sandbox: ${metadata.sandboxResult}`}
					</span>
				)}
			</div>
			{/*
			  @lore L9 review (sec MEDIUM + adv W4 + design C4): blast_radius
			  is the founder's surface to read what's affected. Show a compact
			  summary; expand on click for full lists. Falls within the
			  metadata strip area so every kind surfaces it consistently.
			*/}
			{blast.hasAny && (
				<div
					data-testid="artifact-blast-radius"
					className="flex flex-wrap items-baseline gap-2 px-3 py-1 text-xs font-mono border-b border-[var(--border-subtle)] text-[var(--text-mid)]"
				>
					<span className="text-[var(--text-lo)] uppercase tracking-wider">Affects:</span>
					<button
						type="button"
						data-testid="artifact-blast-radius-toggle"
						aria-expanded={blastExpanded}
						aria-label="Toggle blast radius details"
						onClick={() => setBlastExpanded((prev) => !prev)}
						className="text-[var(--text-hi)] underline-offset-2 hover:underline"
					>
						{blast.short}
					</button>
					{blastExpanded && (
						<dl
							data-testid="artifact-blast-radius-detail"
							className="flex flex-col gap-0.5 basis-full mt-1"
						>
							{metadata.blastRadius.products.length > 0 && (
								<div className="flex gap-2">
									<dt className="text-[var(--text-lo)] uppercase tracking-wider w-20 shrink-0">
										products
									</dt>
									<dd className="text-[var(--text-hi)]">
										{metadata.blastRadius.products.join(", ")}
									</dd>
								</div>
							)}
							{metadata.blastRadius.teams.length > 0 && (
								<div className="flex gap-2">
									<dt className="text-[var(--text-lo)] uppercase tracking-wider w-20 shrink-0">
										teams
									</dt>
									<dd className="text-[var(--text-hi)]">{metadata.blastRadius.teams.join(", ")}</dd>
								</div>
							)}
							{metadata.blastRadius.agents.length > 0 && (
								<div className="flex gap-2">
									<dt className="text-[var(--text-lo)] uppercase tracking-wider w-20 shrink-0">
										agents
									</dt>
									<dd className="text-[var(--text-hi)]">
										{metadata.blastRadius.agents.join(", ")}
									</dd>
								</div>
							)}
						</dl>
					)}
				</div>
			)}
			<div className="p-[var(--density-card-pad)]">{children}</div>
		</div>
	);
}
