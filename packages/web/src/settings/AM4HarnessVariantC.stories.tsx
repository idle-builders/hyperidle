/**
 * AM4 Variant C — "Provider cards" (t3code Providers lineage).
 *
 * Constraint: borrow t3code's Providers settings grammar — each backend is a
 * self-contained card: status header with enable toggle, an auth zone that
 * appears only when there is a next step, and a capabilities Fold (collapsed by
 * default — progressive disclosure). Clean embodiment, not chrome-copy.
 * Thesis: a self-contained card per backend reads as "this is its own thing you
 * own and configure," and the auth zone makes the next step unmissable without
 * shouting at ready backends.
 *
 * Descriptor-driven: card chrome is uniform; only the descriptor-derived zones
 * differ. No per-backend branch — the Fold/auth-zone presence is computed from
 * discovery.state + authAction via the shared mappers.
 */

import { Button, Fold, KeyValue, StatusChip, Toggle } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import { type JSX, useState } from "react";
import { AM4_HARNESS_FIXTURES } from "./AM4HarnessVariants.fixtures.js";
import {
	accessModeLabel,
	commandText,
	hasActionableNextStep,
	isEnableable,
	readinessToStatus,
	showsToggle,
} from "./AM4HarnessPresentation.js";

export default { title: "Settings/AM4 Harnesses · C Cards", group: "Settings" as const };

function HarnessCard({ d }: { d: HarnessCapabilityDescriptor }): JSX.Element {
	const [open, setOpen] = useState(false);
	const { status, label } = readinessToStatus(d.discovery.state);
	const cmd = commandText(d);
	const actionable = hasActionableNextStep(d);
	const hasCaps = d.models.length > 0 || d.runtime.fileEditing || d.runtime.mcpSupport;

	return (
		<div className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] p-[18px] flex flex-col gap-[12px]">
			{/* Header: identity + status + toggle */}
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
				{showsToggle(d) && (
					<Toggle
						label={`Enable ${d.name}`}
						on={d.discovery.state === "ready"}
						disabled={!isEnableable(d)}
					/>
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

			{/* Capabilities — progressive disclosure */}
			{hasCaps && (
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
							<KeyValue label="File editing" value={d.runtime.fileEditing ? "Yes" : "No"} />
							<KeyValue label="MCP" value={d.runtime.mcpSupport ? "Yes" : "No"} />
							<KeyValue label="Sub-agents" value={d.runtime.subAgents ? "Yes" : "No"} />
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
