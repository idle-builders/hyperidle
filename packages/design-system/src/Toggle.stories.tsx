/**
 * Toggle stories.
 */

import type { JSX } from "react";
import { Toggle } from "./Toggle.js";

export default { title: "Toggle" };

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Toggle label="Enable notifications" />
			<Toggle label="Enable notifications" on />
			<Toggle label="Enable feature" description="This enables the experimental feature." />
			<Toggle
				label="Enable feature with long description"
				description="This is a longer description that explains what this toggle controls in more detail."
				on
			/>
		</div>
	);
}

export function DisabledState(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Toggle label="Disabled off" disabled />
			<Toggle label="Disabled on" on disabled />
		</div>
	);
}

/**
 * AI6: Focus ring on the toggle track — 1px `focus-visible:outline-1` (converged from 2px).
 * Inline style forces ring visible for documentation purposes.
 */
export function FocusRing(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<div>
				<p className="text-[11px] text-[var(--text-tertiary)] mb-[6px]">Off (focused)</p>
				<Toggle label="Notifications" />
			</div>
			<div>
				<p className="text-[11px] text-[var(--text-tertiary)] mb-[6px]">On (focused)</p>
				<Toggle label="Notifications" on />
			</div>
		</div>
	);
}

/**
 * AM4: Label-hidden variant — sr-only label for settings rows that toggle without
 * adjacent text (e.g. harness enable/disable rows in SettingsHarnesses).
 * The label is read by screen readers via aria-label but not visually rendered.
 */
export function LabelHidden(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<div className="flex items-center gap-[12px]">
				<span className="text-[13px] text-[var(--text-primary)]">Claude Code</span>
				<Toggle label="Enable Claude Code" labelHidden on />
			</div>
			<div className="flex items-center gap-[12px]">
				<span className="text-[13px] text-[var(--text-primary)] opacity-50">Codex</span>
				<Toggle label="Enable Codex" labelHidden />
			</div>
			<div className="flex items-center gap-[12px]">
				<span className="text-[13px] text-[var(--text-primary)] opacity-50">
					OpenCode (disabled)
				</span>
				<Toggle label="Enable OpenCode" labelHidden disabled />
			</div>
		</div>
	);
}
