/**
 * HarnessCard — one backend row in the Providers list (AM4, Variant C design).
 *
 * Presentational — receives descriptor + callbacks, renders the Variant C
 * dense-list row: status dot · name/version · status line · optional toggle + fold.
 *
 * Zones (all conditional, descriptor-driven):
 *  - Row: status dot, name, version, status line, optional toggle, optional fold trigger
 *  - Auth zone: rendered when hasActionableNextStep(d) — CTA button + mono command
 *  - Capabilities fold: rendered when hasCaps(d) and fold is open
 *
 * Descriptor-driven contract: ZERO per-backend type branches. All zones computed
 * from harness-presentation.ts mappers. The ESLint no-restricted-syntax rule (task 12)
 * enforces this. The only type check here is routing to the builtin CTA — which is
 * handled by hasActionableNextStep/showsToggle returning false for builtin, not an
 * explicit type branch.
 *
 * @lore AM4: onToggle callback receives (type, newDisabledState) — the parent
 * (SettingsHarnesses) calls POST /api/harnesses/:type/disabled and refreshes the list.
 */

// hearth-internal-padding

import { Button, Fold, KeyValue, Toggle } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
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
} from "./harness-presentation.js";

export interface HarnessCardProps {
	descriptor: HarnessCapabilityDescriptor;
	/** Called when the user flips the toggle. Args: (type, newDisabledState). */
	onToggle: (type: string, disabled: boolean) => void;
}

// Status dot color map — uses Hearth status token family (AQ-008: no hardcoded colors)
const STATUS_DOT_COLORS: Record<string, string> = {
	healthy: "var(--status-healthy)",
	behind: "var(--status-behind)",
	paused: "var(--status-paused)",
	blocked: "var(--status-blocked)",
	done: "var(--status-done)",
	error: "var(--status-error)",
	unknown: "var(--text-tertiary)",
};

function statusDotColor(tone: string): string {
	return STATUS_DOT_COLORS[tone] ?? STATUS_DOT_COLORS.unknown ?? "var(--text-tertiary)";
}

export function HarnessCard({ descriptor, onToggle }: HarnessCardProps): JSX.Element {
	const d = descriptor;
	const sl = statusLine(d);
	const cmd = commandText(d);
	const showAuthZone = hasActionableNextStep(d);
	const showToggle = showsToggle(d);
	const enabled = isEnabled(d);
	const showFoldTrigger = hasCaps(d);
	const caps = provenCapabilities(d);
	const capSummary = capabilitySummary(d);
	const isDisabled = !enabled;

	const [foldOpen, setFoldOpen] = useState(false);

	// Version from discovery
	const version = (d.discovery as { version?: string }).version;

	return (
		<div className="flex flex-col">
			{/* Main row */}
			<div
				className={`flex items-center gap-[9px] px-[12px] py-[12px] ${isDisabled ? "opacity-70" : ""}`}
			>
				{/* Status dot — 6px, color from statusLine tone */}
				<span
					className="shrink-0 rounded-full"
					style={{
						width: 6,
						height: 6,
						backgroundColor: statusDotColor(sl.tone),
						opacity: isDisabled ? 0.5 : 1,
					}}
					aria-hidden="true"
				/>

				{/* Left content: name + version stack over status line */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-[6px] flex-wrap">
						<span
							className={`text-[14px] font-[600] leading-[1.2] ${isDisabled ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
						>
							{d.name}
						</span>
						{version && (
							<span className="text-[12px] font-[500] text-[var(--text-tertiary)] font-mono">
								v{version}
							</span>
						)}
					</div>
					{/* Status line */}
					<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4] mt-[1px]">
						{sl.text}
					</p>
				</div>

				{/* Right affordances: fold trigger + toggle */}
				<div className="flex items-center gap-[9px] shrink-0">
					{showFoldTrigger && !isDisabled && (
						<Fold cta={foldOpen ? "Hide" : "Show"} onShow={() => setFoldOpen((prev) => !prev)} />
					)}
					{showToggle && (
						<Toggle
							label={`Enable ${d.name}`}
							labelHidden
							on={enabled}
							onChange={(newOn) => {
								// newOn = true means enabling (disabled = false)
								onToggle(d.type, !newOn);
							}}
						/>
					)}
				</div>
			</div>

			{/* Auth zone — only when hasActionableNextStep */}
			{showAuthZone && (
				<div className="flex items-center gap-[9px] px-[12px] pb-[9px] pl-[27px]">
					<Button
						variant="primary"
						size="sm"
						onClick={() => {
							/* auth action — managed by parent */
						}}
					>
						{d.authAction.label}
					</Button>
					{cmd && (
						<code className="text-[12px] font-mono text-[var(--text-tertiary)] bg-[var(--surface-default)] px-[6px] py-[3px] rounded-[var(--r-subtle)] select-all">
							{cmd}
						</code>
					)}
				</div>
			)}

			{/* Capabilities summary — always visible when caps not yet proven (non-builtin only;
			    builtin is always-on so this message is not surfaced for it) */}
			{showFoldTrigger && !isDisabled && caps.length === 0 && showToggle && (
				<p className="text-[12px] text-[var(--text-tertiary)] leading-[1.4] px-[12px] pb-[6px] pl-[27px]">
					{capSummary}
				</p>
			)}

			{/* Proven caps line — always visible when caps are known */}
			{showFoldTrigger && !isDisabled && caps.length > 0 && (
				<div className="px-[12px] pb-[6px] pl-[27px]">
					<KeyValue label="Capabilities" value={capSummary} layout="inline" />
				</div>
			)}

			{/* Model rows fold — expanded content (models only) */}
			{showFoldTrigger && !isDisabled && foldOpen && d.models.length > 0 && (
				<div className="flex flex-col gap-[6px] px-[12px] pb-[12px] pl-[27px]">
					{d.models.map((model) => (
						<KeyValue
							key={model.id}
							label={model.provider ?? "model"}
							value={model.label}
							layout="inline"
						/>
					))}
				</div>
			)}
		</div>
	);
}
