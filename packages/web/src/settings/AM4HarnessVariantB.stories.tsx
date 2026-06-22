/**
 * AM4 Variant B — "Get-to-working checklist".
 *
 * Constraint: optimise for the single first-run task — get from install to a
 * working agent. Backends are split into "Needs you" (float to top, each with
 * its one action) and "Ready" (collapsed, quiet confirmation). Unavailable sits
 * in a muted footer.
 * Thesis: at first run the user is not browsing a settings table — they want the
 * shortest path to "I have a working backend." Surface the gap, not the grid.
 *
 * Descriptor-driven: partitioning is by discovery.state via the shared mappers;
 * no per-backend branch.
 */

import { Button, StatusChip } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import type { JSX } from "react";
import { AM4_HARNESS_FIXTURES } from "./AM4HarnessVariants.fixtures.js";
import {
	capabilitySummary,
	commandText,
	hasActionableNextStep,
	readinessToStatus,
} from "./AM4HarnessPresentation.js";

export default { title: "Settings/AM4 Harnesses · B Checklist", group: "Settings" as const };

/** A backend the user must act on to make usable. */
function NeedsYouRow({ d }: { d: HarnessCapabilityDescriptor }): JSX.Element {
	const { status, label } = readinessToStatus(d.discovery.state);
	const cmd = commandText(d);
	return (
		<div className="flex items-start gap-[12px] p-[12px] rounded-[var(--r-subtle)] bg-[var(--surface-page)]">
			<div className="flex-1 flex flex-col gap-[6px] min-w-0">
				<div className="flex items-center gap-[9px]">
					<span className="text-[15px] font-[500] text-[var(--text-primary)]">{d.name}</span>
					<StatusChip status={status} label={label} />
					{d.discovery.version && (
						<span className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--text-tertiary)]">
							v{d.discovery.version}
						</span>
					)}
				</div>
				{cmd ? (
					<span className="text-[12px] text-[var(--text-tertiary)]">
						Sign in once via the CLI:{" "}
						<code className="font-[family-name:var(--font-mono)] text-[var(--text-secondary)]">
							{cmd}
						</code>
					</span>
				) : (
					<span className="text-[12px] text-[var(--text-tertiary)]">
						{d.authAction.description ?? "Add a credential to enable this backend."}
					</span>
				)}
			</div>
			<Button variant="primary" size="sm" className="shrink-0">
				{d.authAction.label}
			</Button>
		</div>
	);
}

/** A ready backend — quiet, confirmed, capability summary inline. */
function ReadyRow({ d }: { d: HarnessCapabilityDescriptor }): JSX.Element {
	const { status, label } = readinessToStatus(d.discovery.state);
	return (
		<div className="flex items-center gap-[9px] py-[9px] border-b border-[var(--border-subtle)] last:border-b-0">
			<StatusChip status={status} label={label} />
			<span className="text-[13px] font-[500] text-[var(--text-primary)]">{d.name}</span>
			<span className="text-[12px] text-[var(--text-tertiary)] truncate">
				{capabilitySummary(d)}
			</span>
			<span className="flex-1" />
			{d.discovery.version && (
				<span className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--text-tertiary)]">
					v{d.discovery.version}
				</span>
			)}
			<Button variant="ghost" size="sm">
				Configure
			</Button>
		</div>
	);
}

export function Checklist(): JSX.Element {
	const needsYou = AM4_HARNESS_FIXTURES.filter(hasActionableNextStep);
	const ready = AM4_HARNESS_FIXTURES.filter((d) => d.discovery.state === "ready");
	const unavailable = AM4_HARNESS_FIXTURES.filter((d) => d.discovery.state === "unavailable");

	return (
		<div
			data-theme="hearth-light"
			className="bg-[var(--surface-page)] p-[24px] min-h-screen font-[family-name:var(--font-sans)]"
		>
			<div className="max-w-[680px] mx-auto flex flex-col gap-[24px]">
				<div className="flex flex-col gap-[3px]">
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">
						Connect your agent backends
					</h2>
					<p className="text-[13px] text-[var(--text-tertiary)]">
						{ready.length} ready · {needsYou.length} need sign-in. You can run agents as soon as one
						is ready.
					</p>
				</div>

				{/* Needs you — the work */}
				{needsYou.length > 0 && (
					<section className="flex flex-col gap-[9px]">
						<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Needs you
						</h3>
						<div className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[6px] flex flex-col gap-[6px]">
							{needsYou.map((d) => (
								<NeedsYouRow key={d.type} d={d} />
							))}
						</div>
					</section>
				)}

				{/* Ready — quiet confirmation */}
				{ready.length > 0 && (
					<section className="flex flex-col gap-[9px]">
						<h3 className="text-[12px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Ready
						</h3>
						<div className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] px-[18px]">
							{ready.map((d) => (
								<ReadyRow key={d.type} d={d} />
							))}
						</div>
					</section>
				)}

				{/* Unavailable — muted footer, no action */}
				{unavailable.length > 0 && (
					<section className="flex flex-col gap-[6px]">
						{unavailable.map((d) => (
							<p key={d.type} className="text-[12px] text-[var(--text-tertiary)]">
								<span className="font-[500] text-[var(--text-secondary)]">{d.name}</span> —{" "}
								{d.discovery.reason}
							</p>
						))}
					</section>
				)}
			</div>
		</div>
	);
}
