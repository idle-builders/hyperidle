/**
 * AM4 Variant C — "Provider cards" (t3code Providers lineage).
 *
 * Constraint: borrow t3code's Providers settings grammar — each backend is a
 * self-contained card: status header with an enabled indication, an auth zone
 * that appears only when there is a next step, and a capabilities Fold
 * (collapsed by default — progressive disclosure). Clean embodiment, not
 * chrome-copy.
 * Thesis: a self-contained card per backend reads as "this is its own thing you
 * own and configure," and the auth zone makes the next step unmissable without
 * shouting at ready backends.
 *
 * Descriptor-driven: card chrome is uniform; only the descriptor-derived zones
 * differ. No per-backend branch — the Fold/auth-zone presence is computed from
 * discovery.state + authAction via the shared mappers.
 *
 * Renders the HONEST PRODUCTION SHAPE (not a masked fixture):
 *  - Enabled indication is shown ONLY for `ready` backends, as a non-interactive
 *    "Enabled" status — nothing in the runtime consumes an on/off flag
 *    (AdapterPool.select() gates on capacity/modelProviders/harnessType only),
 *    so a flippable switch would be a control nothing backs. Non-ready states
 *    show no indication — the auth CTA is the sole affordance there.
 *  - Capabilities Fold renders only PROVEN (true) runtime caps. Production
 *    discovery does NOT run the session probe (AM2 @lore), so real `ready`
 *    backends return runtime caps all-`false` — the fold then reads
 *    "Capabilities confirmed after first run", never a wall of "No".
 */

import { Button, Fold, KeyValue, StatusChip } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import {
	accessModeLabel,
	capabilitySummary,
	commandText,
	hasActionableNextStep,
	hasCaps,
	provenCapabilities,
	readinessToStatus,
	showsEnabledIndication,
} from "./AM4HarnessPresentation.js";
import { AM4_HARNESS_FIXTURES } from "./AM4HarnessVariants.fixtures.js";

export default { title: "Settings/AM4 Harnesses · C Cards", group: "Settings" as const };

function HarnessCard({ d }: { d: HarnessCapabilityDescriptor }): JSX.Element {
	const [open, setOpen] = useState(false);
	const { status, label } = readinessToStatus(d.discovery.state);
	const cmd = commandText(d);
	const actionable = hasActionableNextStep(d);
	const proven = provenCapabilities(d);

	return (
		<div className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[18px] flex flex-col gap-[12px]">
			{/* Header: identity + status + enabled indication */}
			<div className="flex items-center gap-[12px]">
				<div className="flex flex-col gap-[3px] flex-1 min-w-0">
					<div className="flex items-center gap-[9px]">
						<span className="text-[17px] font-[500] text-[var(--text-primary)]">{d.name}</span>
						<StatusChip status={status} label={label} />
					</div>
					<span className="text-[12px] text-[var(--text-tertiary)]">
						{accessModeLabel(d.accessMode)}
						{d.discovery.version && (
							<>
								{" · "}
								<span className="font-[family-name:var(--font-mono)]">v{d.discovery.version}</span>
							</>
						)}
					</span>
				</div>
				{/* Non-interactive "Enabled" indication — only on ready backends.
				    No flippable switch: no runtime consumes an on/off flag (see file header). */}
				{showsEnabledIndication(d) && (
					<span className="text-[12px] font-[500] text-[var(--accent-primary)] whitespace-nowrap">
						Enabled
					</span>
				)}
			</div>

			{/* Auth zone — only when there is an actionable next step */}
			{actionable && (
				<div className="flex flex-col gap-[9px] p-[12px] rounded-[var(--r-subtle)] bg-[var(--surface-page)]">
					<span className="text-[13px] text-[var(--text-secondary)]">
						{d.authAction.description ??
							"Present on this machine, but not signed in yet. One step to enable:"}
					</span>
					<div className="flex items-center gap-[9px] flex-wrap">
						<Button variant="primary" size="sm">
							{d.authAction.label}
						</Button>
						{cmd && (
							<code className="text-[12px] font-[family-name:var(--font-mono)] bg-[var(--surface-container)] text-[var(--text-secondary)] px-[9px] py-[3px] rounded-[var(--r-subtle)]">
								{cmd}
							</code>
						)}
					</div>
				</div>
			)}

			{/* Unavailable reason — informational, no CTA */}
			{d.discovery.state === "unavailable" && d.discovery.reason && (
				<div className="p-[12px] rounded-[var(--r-subtle)] bg-[var(--surface-page)]">
					<span className="text-[13px] text-[var(--text-tertiary)]">{d.discovery.reason}</span>
				</div>
			)}

			{/* Capabilities — progressive disclosure. Renders proven caps only;
			    falls back to the "confirmed after first run" line when caps unknown. */}
			{hasCaps(d) && (
				<div className="flex flex-col gap-[9px]">
					<Fold
						label="Models & capabilities"
						cta={open ? "Hide" : "Show"}
						onShow={() => setOpen((v) => !v)}
					/>
					{open && (
						<div className="flex flex-col gap-[9px] pl-[18px]">
							{d.models.map((m) => (
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
			)}
		</div>
	);
}

/** Actionable-first ordering (synthesis pull from B): needs-you → ready → unavailable. */
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

export function Cards(): JSX.Element {
	const sorted = [...AM4_HARNESS_FIXTURES].sort(byActionableFirst);
	const ready = AM4_HARNESS_FIXTURES.filter((d) => d.discovery.state === "ready").length;
	const needs = AM4_HARNESS_FIXTURES.filter(hasActionableNextStep).length;

	return (
		<div
			data-theme="hearth-light"
			className="bg-[var(--surface-page)] p-[24px] min-h-screen font-[family-name:var(--font-sans)]"
		>
			<div className="max-w-[680px] mx-auto flex flex-col gap-[18px]">
				<div className="flex flex-col gap-[3px]">
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">
						Agent backends
					</h2>
					<p className="text-[13px] text-[var(--text-tertiary)]">
						{ready} ready · {needs} need sign-in. Enable the ones you want your agents to use — you
						can run agents as soon as one is ready.
					</p>
				</div>
				<div className="flex flex-col gap-[12px]">
					{sorted.map((d) => (
						<HarnessCard key={d.type} d={d} />
					))}
				</div>
			</div>
		</div>
	);
}
