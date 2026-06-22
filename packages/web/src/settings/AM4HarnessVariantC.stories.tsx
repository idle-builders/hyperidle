/**
 * AM4 Variant C — "Providers list" (t3code Providers lineage, refined).
 *
 * Refined from the founder's real t3code Settings → Providers reference
 * (Screenshot 2026-06-16 at 22.15.42.png). The prior round was boxy: oversized
 * shadowed cards, big tinted auth insets, loud uppercase status pills. This is
 * the calm, dense reference grammar:
 *
 *  - ONE bordered container, hairline-divided rows — not a stack of heavy cards.
 *  - Each row: tiny status DOT + bold name + muted-mono version inline + optional
 *    "Early Access" Tag · ONE quiet line of muted status sub-text (never a loud
 *    uppercase StatusChip pill) · right-aligned Fold chevron + enable/disable
 *    Toggle.
 *  - Section header carries "Providers" + "Checked just now" + a ghost refresh
 *    button (the re-detect affordance → POST /api/harnesses/redetect).
 *  - The auth zone is a quiet inset, shown ONLY when there is a next step.
 *
 * Toggle (R1 reversal — founder review + AC2): a REAL enable/disable switch,
 * right-aligned per row, shown only for backends that can meaningfully be
 * enabled/disabled (ready / installed / unauthenticated families — descriptor-
 * driven via showsToggle, NOT a per-family table). It is backed by a persisted
 * `harness.disabled` setting that AdapterPool.select() honors; a disabled
 * backend renders "Disabled — …" and is not selected. `missing`/`unavailable`
 * show NO toggle (nothing to disable).
 *
 * NOTE (component budget): the DS `Toggle` always renders a visible text label
 * beside the track; the reference switch is bare. This story renders the switch
 * with `Toggle`'s exact visual + a11y contract inline with an sr-only aria-label.
 * The builder should add a label-less / sr-only-label affordance to DS `Toggle`
 * (used by every settings row that toggles without adjacent text) rather than
 * hand-rolling — flagged in architecture.md.
 *
 * Descriptor-driven: row chrome is uniform; only descriptor-derived zones differ.
 * No per-backend branch — every zone's presence routes through the shared mappers.
 *
 * HONEST PRODUCTION SHAPE: runtime caps all-`false` (session probe not run, AM2
 * @lore) → the fold reads "Capabilities confirmed after first run", never "No".
 */

import { Button, Fold, KeyValue, Tag } from "@hyperidle/design-system";
import type {
	HarnessCapabilityDescriptor,
	HarnessModelDescriptor,
} from "@hyperidle/shared";
import { type JSX, useState } from "react";
import {
	capabilitySummary,
	commandText,
	hasActionableNextStep,
	hasCaps,
	isEnabled,
	provenCapabilities,
	showsToggle,
	statusLine,
} from "./AM4HarnessPresentation.js";
import { AM4_HARNESS_FIXTURES } from "./AM4HarnessVariants.fixtures.js";

export default { title: "Settings/AM4 Harnesses · C Cards", group: "Settings" as const };

/** Dot color follows the same --status-* family StatusChip uses, but quiet. */
const DOT_TONE: Record<string, string> = {
	healthy: "bg-[var(--status-success)]",
	behind: "bg-[var(--status-warning)]",
	paused: "bg-[var(--status-warning)]",
	blocked: "bg-[var(--status-error)]",
	error: "bg-[var(--status-error)]",
	done: "bg-[var(--status-success)]",
	unknown: "bg-[var(--text-tertiary)]",
};

/**
 * Bare enable/disable switch — DS `Toggle`'s exact visual + a11y contract,
 * minus the adjacent text label (sr-only aria-label instead). See file header:
 * builder folds this into DS `Toggle` as a label-less variant.
 */
function RowToggle({
	on,
	ariaLabel,
}: {
	on: boolean;
	ariaLabel: string;
}): JSX.Element {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={on}
			aria-label={ariaLabel}
			className={[
				"relative inline-flex shrink-0 h-[24px] w-[44px] items-center rounded-full",
				"border-[1.5px] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				"focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]",
				on
					? "bg-[var(--accent-primary)] border-[var(--accent-primary)]"
					: "bg-[var(--border-default)] border-[var(--border-default)]",
			].join(" ")}
		>
			<span
				className={[
					"absolute top-[2px] h-[18px] w-[18px] rounded-full",
					"bg-[var(--surface-elevated)] shadow-[var(--shadow-subtle)]",
					"transition-transform duration-[var(--motion-fast)]",
					on ? "translate-x-[22px]" : "translate-x-[2px]",
				].join(" ")}
				style={{ transitionTimingFunction: "var(--easing-expressive)" }}
			/>
		</button>
	);
}

function HarnessRow({
	d,
	last,
}: {
	d: HarnessCapabilityDescriptor & { badge?: string };
	last: boolean;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const { tone, text } = statusLine(d);
	const cmd = commandText(d);
	const actionable = hasActionableNextStep(d);
	const proven = provenCapabilities(d);
	const enabled = isEnabled(d);
	const dimmed = !enabled; // disabled rows read quieter, like the reference

	return (
		<div className={last ? "" : "border-b border-[var(--border-subtle)]"}>
			{/* Row: dot + identity + status sub-text · fold chevron · toggle */}
			<div className="flex items-center gap-[12px] py-[12px] px-[12px]">
				<span
					className={`h-[6px] w-[6px] rounded-full shrink-0 ${DOT_TONE[tone] ?? DOT_TONE.unknown} ${dimmed ? "opacity-50" : ""}`}
				/>
				<div className="flex flex-col gap-[3px] flex-1 min-w-0">
					<div className="flex items-center gap-[9px] flex-wrap">
						<span
							className={`text-[14px] font-[600] ${dimmed ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
						>
							{d.name}
						</span>
						{d.discovery.version && (
							<span className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--text-tertiary)]">
								v{d.discovery.version}
							</span>
						)}
						{d.badge && <Tag label={d.badge} />}
					</div>
					<span className="text-[12px] text-[var(--text-tertiary)] leading-[1.4]">
						{text}
					</span>
				</div>
				{hasCaps(d) && (
					<Fold cta={open ? "Hide" : "Models"} onShow={() => setOpen((v) => !v)} />
				)}
				{showsToggle(d) && (
					<RowToggle on={enabled} ariaLabel={`Enable ${d.name}`} />
				)}
			</div>

			{/* Auth zone — quiet inset, only when there is an actionable next step */}
			{actionable && (
				<div className="flex items-center gap-[9px] flex-wrap pb-[12px] px-[12px] pl-[30px]">
					<Button variant="primary" size="sm">
						{d.authAction.label}
					</Button>
					{cmd && (
						<code className="text-[12px] font-[family-name:var(--font-mono)] bg-[var(--surface-container)] text-[var(--text-secondary)] px-[9px] py-[3px] rounded-[var(--r-subtle)]">
							{cmd}
						</code>
					)}
				</div>
			)}

			{/* Capabilities — progressive disclosure. Proven caps only; falls back to
			    "confirmed after first run" under the production all-false shape. */}
			{hasCaps(d) && open && (
				<div className="flex flex-col gap-[6px] pb-[12px] px-[12px] pl-[30px]">
					{d.models.map((m: HarnessModelDescriptor) => (
						<KeyValue
							key={m.id}
							label={m.provider ?? "model"}
							value={m.label}
							layout="inline"
						/>
					))}
					{proven.length > 0 ? (
						<KeyValue label="Capabilities" value={proven.join(" · ")} layout="inline" />
					) : (
						<span className="text-[12px] text-[var(--text-tertiary)]">
							{capabilitySummary(d)}
						</span>
					)}
				</div>
			)}
		</div>
	);
}

/** Actionable-first ordering: needs-you → ready → disabled → unavailable. */
const ORDER: Record<string, number> = {
	unauthenticated: 0,
	installed: 1,
	ready: 2,
	missing: 3,
	unavailable: 4,
};
function byActionableFirst(
	a: HarnessCapabilityDescriptor,
	b: HarnessCapabilityDescriptor,
): number {
	return (ORDER[a.discovery.state] ?? 9) - (ORDER[b.discovery.state] ?? 9);
}

function Providers({ theme }: { theme: string }): JSX.Element {
	const sorted = [...AM4_HARNESS_FIXTURES].sort(byActionableFirst);

	return (
		<div
			data-theme={theme}
			className="bg-[var(--surface-page)] p-[24px] min-h-screen font-[family-name:var(--font-sans)]"
		>
			<div className="max-w-[640px] mx-auto flex flex-col gap-[12px]">
				{/* Section header: title · checked timestamp · refresh (re-detect) */}
				<div className="flex items-center justify-between gap-[12px] px-[3px]">
					<span className="text-[11px] font-[600] tracking-[var(--tracking-caps-sm)] uppercase text-[var(--text-tertiary)]">
						Providers
					</span>
					<div className="flex items-center gap-[9px]">
						<span className="text-[12px] text-[var(--text-tertiary)]">Checked just now</span>
						<Button variant="ghost" size="sm" aria-label="Re-detect backends">
							Refresh
						</Button>
					</div>
				</div>

				{/* One bordered container, hairline-divided rows — the calm reference shape. */}
				<div className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] border border-[var(--border-subtle)] shadow-[var(--shadow-default)] overflow-hidden">
					{sorted.map((d, i) => (
						<HarnessRow key={d.type} d={d} last={i === sorted.length - 1} />
					))}
				</div>
			</div>
		</div>
	);
}

export function Cards(): JSX.Element {
	return <Providers theme="hearth-light" />;
}

export function Dark(): JSX.Element {
	return <Providers theme="hearth-dark" />;
}
