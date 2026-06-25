/**
 * AL5 — SettingsReviewSurfaces stories.
 *
 * Renders the adopt/browse management surface (design doc Surface 1) in its
 * populated real state (loading/empty/error deferred to the builder per
 * no-skeleton/error-in-initial-designs MEMORY).
 *
 * Uses the production component directly; API calls are not mocked in stories
 * (the stories render static fixture data via props/stubs at story level).
 * The populated variant shows the page header + adopted group + available group.
 */

import {
	Button,
	Dialog,
	ItemList,
	Menu,
	type MenuItem,
	Row,
	SectionLabel,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import type { AdoptionView, SurfaceManifest, TrustTier } from "@hyperidle/shared";
import { type JSX, useState } from "react";

export default {
	title: "SettingsReviewSurfaces",
	group: "Settings" as const,
};

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ADOPTIONS: AdoptionView[] = [
	{
		id: "adp-1",
		tool: "stripe",
		kind: "action_operation",
		surfaceId: "stripe-refund-review",
		pinnedVersion: "1.0.0",
		provenance: "first-party",
		trustTier: "vetted",
		surfaceTitle: "Stripe Refund Review",
		baseCanvas: "action_operation",
	},
];

const MANIFESTS: SurfaceManifest[] = [
	{
		id: "stripe-refund-review",
		title: "Stripe Refund Review",
		description:
			"Specialized canvas for Stripe refund approvals. Shows charge, customer, and reversibility window.",
		author: "HyperIdle <hello@hyperidle.com>",
		version: "1.0.0",
		baseCanvas: "action_operation",
		layering: "wrap",
		provenance: "first-party",
		trustTier: "vetted",
		situations: [{ tool: "stripe", kind: "action_operation" }],
		sampleFixture: "StripeRefundReview--Default",
	},
	{
		id: "github-pr-merge",
		title: "GitHub PR Merge Review",
		description: "Shows PR diff, CI status, and review summary before merge approval.",
		author: "HyperIdle <hello@hyperidle.com>",
		version: "0.9.0",
		baseCanvas: "action_operation",
		layering: "wrap",
		provenance: "first-party",
		trustTier: "vetted",
		situations: [{ tool: "github", kind: "action_operation" }],
		sampleFixture: "GitHubPRMergeReview--Default",
	},
];

// The available manifests are those not already adopted.
const ADOPTED_IDS = new Set(ADOPTIONS.map((a) => a.surfaceId));
const AVAILABLE_MANIFESTS = MANIFESTS.filter((m) => !ADOPTED_IDS.has(m.id));

// ---------------------------------------------------------------------------
// Inline helpers (mirrors SettingsReviewSurfaces.tsx — not imported since
// stories must be self-contained and not depend on prod api-fetch calls).
// ---------------------------------------------------------------------------

function TrustTag({ tier }: { tier: TrustTier }): JSX.Element {
	if (tier === "vetted") {
		return (
			<span className="inline-flex items-center gap-[4px] text-[12px] text-[var(--accent-primary)]">
				<span className="h-[6px] w-[6px] rounded-full bg-[var(--accent-primary)]" />
				Vetted
			</span>
		);
	}
	return <Tag label="Community" />;
}

function SituationMark({ tool }: { tool: string }): JSX.Element {
	return (
		<span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)]">
			{tool.slice(0, 2)}
		</span>
	);
}

function AdoptedRowStory({ adoption: a }: { adoption: AdoptionView }): JSX.Element {
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const menuItems: MenuItem[] = [
		{
			id: "reset",
			label: "Reset to base canvas",
			onSelect: () => {
				setMenuOpen(false);
				setConfirming(true);
			},
			destructive: true,
		},
	];

	return (
		<Row
			lead={<SituationMark tool={a.tool} />}
			title={
				<span className="flex items-center gap-[9px]">
					{a.tool} · {a.kind}
					<TrustTag tier={a.trustTier} />
				</span>
			}
			subtitle={
				<span className="text-[var(--text-tertiary)]">
					{a.surfaceTitle} @{a.pinnedVersion} · {a.provenance}
				</span>
			}
			cells={[{ content: `wraps ${a.baseCanvas}`, tone: "neutral" as const, width: 140 }]}
			actions={
				<span className="flex items-center gap-[9px]">
					<StatusChip status="healthy" label="Active" />
					{confirming ? (
						<span className="flex items-center gap-[6px]">
							<Button
								variant="ghost"
								size="sm"
								className="text-[var(--status-error)]"
								onClick={() => setConfirming(false)}
								aria-label={`Confirm reset ${a.tool} · ${a.kind} to base canvas`}
							>
								Confirm?
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
								Cancel
							</Button>
						</span>
					) : (
						<div className="relative">
							<Button
								variant="ghost"
								size="sm"
								aria-label={`Actions for ${a.tool} · ${a.kind}`}
								onClick={() => setMenuOpen((o) => !o)}
							>
								⋯
							</Button>
							<Menu
								open={menuOpen}
								onClose={() => setMenuOpen(false)}
								items={menuItems}
								label={`Actions for ${a.tool} · ${a.kind}`}
							/>
						</div>
					)}
				</span>
			}
		/>
	);
}

function AvailableRowStory({
	manifest: m,
	onAdopt,
}: {
	manifest: SurfaceManifest;
	onAdopt: () => void;
}): JSX.Element {
	return (
		<Row
			lead={
				<span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[12px] font-[600] text-[var(--text-secondary)]">
					{m.id.slice(0, 2)}
				</span>
			}
			title={
				<span className="flex items-center gap-[9px]">
					{m.title}
					<TrustTag tier={m.trustTier} />
				</span>
			}
			subtitle={
				<span className="text-[var(--text-tertiary)]">
					wraps {m.baseCanvas} · {m.provenance} @{m.version}
				</span>
			}
			cells={[{ content: `wraps ${m.baseCanvas}`, tone: "neutral" as const, width: 140 }]}
			actions={
				<Button variant="secondary" size="sm" onClick={onAdopt} aria-label={`Adopt ${m.title}`}>
					Adopt…
				</Button>
			}
		/>
	);
}

function BrowseDialogStory({
	open,
	onClose,
	selected,
	onSelect,
}: {
	open: boolean;
	onClose: () => void;
	selected: SurfaceManifest | null;
	onSelect: (m: SurfaceManifest) => void;
}): JSX.Element {
	const situationLabel = selected?.situations[0]
		? `${selected.situations[0].tool} · ${selected.situations[0].kind}`
		: "…";

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Browse registry"
			size="lg"
			footer={
				<div className="flex justify-end gap-[9px]">
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" disabled={!selected}>
						{selected ? `Adopt for ${situationLabel}` : "Select a surface"}
					</Button>
				</div>
			}
		>
			<div className="flex gap-[18px]">
				<div className="flex min-w-0 flex-1 flex-col gap-[12px]">
					<p className="text-[13px] text-[var(--text-secondary)]">
						Available surfaces. Select one to preview it and commit an adoption.
					</p>
					<ItemList variant="contained" isEmpty={MANIFESTS.length === 0}>
						{MANIFESTS.map((m) => (
							<Row
								key={m.id}
								lead={
									<span className="inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--surface-container)] text-[11px] font-[600] text-[var(--text-secondary)]">
										{m.id.slice(0, 2)}
									</span>
								}
								title={
									<span className="flex items-center gap-[9px]">
										<span
											className={
												selected?.id === m.id
													? "font-[600] text-[var(--text-primary)]"
													: "text-[var(--text-primary)]"
											}
										>
											{m.title}
										</span>
										<TrustTag tier={m.trustTier} />
									</span>
								}
								subtitle={
									<span className="text-[var(--text-tertiary)]">
										wraps {m.baseCanvas} · {m.trustTier}
									</span>
								}
								onClick={() => onSelect(m)}
							/>
						))}
					</ItemList>
				</div>
				<div className="flex w-[300px] shrink-0 flex-col gap-[12px] rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-container)] p-[18px]">
					{selected ? (
						<>
							<div className="flex flex-col gap-[6px]">
								<span className="text-[13px] font-[600] text-[var(--text-primary)]">
									{selected.title}
								</span>
								<span className="text-[12px] text-[var(--text-tertiary)]">
									{selected.id} @{selected.version}
								</span>
								<span className="text-[12px] text-[var(--text-secondary)]">
									{selected.description}
								</span>
							</div>
							<div className="flex flex-col gap-[6px] border-t border-[var(--border-subtle)] pt-[12px]">
								<div className="flex justify-between text-[12px]">
									<span className="text-[var(--text-tertiary)]">Provenance</span>
									<span className="text-[var(--text-secondary)]">{selected.provenance}</span>
								</div>
								<div className="flex justify-between text-[12px]">
									<span className="text-[var(--text-tertiary)]">Trust</span>
									<TrustTag tier={selected.trustTier} />
								</div>
								<div className="flex justify-between text-[12px]">
									<span className="text-[var(--text-tertiary)]">Base canvas</span>
									<span className="font-mono text-[var(--text-secondary)]">
										{selected.baseCanvas}
									</span>
								</div>
							</div>
						</>
					) : (
						<p className="text-[13px] text-[var(--text-tertiary)]">
							Select a surface on the left to see a preview.
						</p>
					)}
				</div>
			</div>
		</Dialog>
	);
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const Populated = (): JSX.Element => {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogSelected, setDialogSelected] = useState<SurfaceManifest | null>(null);

	return (
		<div className="flex max-w-[760px] flex-col gap-[24px] bg-[var(--surface-page)] p-[24px]">
			<div className="flex items-start justify-between gap-[12px]">
				<div>
					<h2 className="text-[20px] font-[600] text-[var(--text-primary)]">Review surfaces</h2>
					<p className="mt-[3px] max-w-[520px] text-[13px] text-[var(--text-secondary)]">
						Choose which review surface renders each kind of artifact. The base canvas is always the
						fallback — a surface only renders by deliberate adoption.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => {
						setDialogSelected(null);
						setDialogOpen(true);
					}}
				>
					Browse registry
				</Button>
			</div>

			<section className="flex flex-col gap-[9px]">
				<div className="flex flex-col gap-[3px]">
					<SectionLabel label="Adopted" />
					<p className="text-[12px] text-[var(--text-tertiary)]">
						Your team's committed (situation → surface) mappings. Each row is an active adoption,
						version-pinned.
					</p>
				</div>
				<ItemList variant="contained" isEmpty={ADOPTIONS.length === 0}>
					{ADOPTIONS.map((a) => (
						<AdoptedRowStory key={a.id} adoption={a} />
					))}
				</ItemList>
			</section>

			<section className="flex flex-col gap-[9px]">
				<div className="flex flex-col gap-[3px]">
					<SectionLabel label="Available" />
					<p className="text-[12px] text-[var(--text-tertiary)]">
						Surfaces in your registries not yet assigned to any situation. Adopt one to make it
						active for the matching artifact kind.
					</p>
				</div>
				<ItemList variant="contained" isEmpty={AVAILABLE_MANIFESTS.length === 0}>
					{AVAILABLE_MANIFESTS.map((m) => (
						<AvailableRowStory
							key={m.id}
							manifest={m}
							onAdopt={() => {
								setDialogSelected(m);
								setDialogOpen(true);
							}}
						/>
					))}
				</ItemList>
			</section>

			<BrowseDialogStory
				open={dialogOpen}
				onClose={() => {
					setDialogOpen(false);
					setDialogSelected(null);
				}}
				selected={dialogSelected}
				onSelect={setDialogSelected}
			/>
		</div>
	);
};
Populated.storyName = "Review Surfaces — Populated (adopted + available)";
