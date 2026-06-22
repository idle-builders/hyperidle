/**
 * AM4 Variant A — "Dense status list".
 *
 * Constraint: smallest component count; SettingsModels/SettingsAgents tier-row
 * lineage. One row per backend, scan-all-at-once at maximum information density.
 * Thesis: a settings power-user wants the whole fleet's readiness in one glance;
 * the action lives inline on the row that needs it.
 *
 * Descriptor-driven: every row renders via AM4HarnessPresentation mappers. No
 * per-backend branch. Populated real-state only (no skeleton/error/empty here).
 */

import { Button, KeyValue, StatusChip, Toggle } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import type { JSX } from "react";
import { AM4_HARNESS_FIXTURES } from "./AM4HarnessVariants.fixtures.js";
import {
	accessModeLabel,
	capabilitySummary,
	commandText,
	hasActionableNextStep,
	isEnableable,
	readinessToStatus,
	showsToggle,
} from "./AM4HarnessPresentation.js";

export default { title: "Settings/AM4 Harnesses · A Dense list", group: "Settings" as const };

function HarnessRow({ d }: { d: HarnessCapabilityDescriptor }): JSX.Element {
	const { status, label } = readinessToStatus(d.discovery.state);
	const cmd = commandText(d);
	const actionable = hasActionableNextStep(d);

	return (
		<div className="flex flex-col gap-[9px] py-[12px] border-b border-[var(--border-subtle)] last:border-b-0">
			{/* Primary row: identity + status + version + access + toggle */}
			<div className="flex items-center gap-[12px]">
				<span className="text-[15px] font-[500] text-[var(--text-primary)] w-[140px] shrink-0">
					{d.name}
				</span>
				<StatusChip status={status} label={label} />
				<span className="text-[12px] font-[family-name:var(--font-mono)] text-[var(--text-tertiary)]">
					{d.discovery.version ? `v${d.discovery.version}` : accessModeLabel(d.accessMode)}
				</span>
				<span className="flex-1" />
				{showsToggle(d) ? (
					<div className="shrink-0 whitespace-nowrap">
						<Toggle
							label={`Enable ${d.name}`}
							on={d.discovery.state === "ready"}
							disabled={!isEnableable(d)}
						/>
					</div>
				) : (
					<span className="text-[12px] text-[var(--text-tertiary)] italic shrink-0">
						No setup here
					</span>
				)}
			</div>

			{/* Secondary line: capability summary (reference, quiet) */}
			<div className="flex items-center gap-[12px] pl-[152px]">
				<span className="text-[12px] text-[var(--text-tertiary)]">{capabilitySummary(d)}</span>
			</div>

			{/* Actionable next step — only when descriptor says so */}
			{actionable && (
				<div className="flex items-center gap-[9px] pl-[152px]">
					<Button variant="primary" size="sm">
						{d.authAction.label}
					</Button>
					{cmd && (
						<>
							<span className="text-[12px] text-[var(--text-tertiary)]">or run</span>
							<code className="text-[12px] font-[family-name:var(--font-mono)] bg-[var(--surface-container)] text-[var(--text-secondary)] px-[9px] py-[3px] rounded-[var(--r-subtle)]">
								{cmd}
							</code>
						</>
					)}
				</div>
			)}

			{/* Unavailable reason — informational, no CTA */}
			{d.discovery.state === "unavailable" && d.discovery.reason && (
				<div className="pl-[152px]">
					<span className="text-[12px] text-[var(--text-tertiary)]">{d.discovery.reason}</span>
				</div>
			)}
		</div>
	);
}

export function DenseList(): JSX.Element {
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
						Detected on this machine. Sign in to any backend to start running agents on it.
					</p>
				</div>
				<div className="bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-default)] px-[18px] py-[6px]">
					{AM4_HARNESS_FIXTURES.map((d) => (
						<HarnessRow key={d.type} d={d} />
					))}
				</div>
				<KeyValue label="Detected" value={`${AM4_HARNESS_FIXTURES.length} backends`} />
			</div>
		</div>
	);
}
