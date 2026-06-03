/**
 * SettingsPage — stacked single-page layout for all settings sections.
 *
 * W3 AC-47: All settings sections stacked vertically in one scrollable page.
 * No sidebar navigation — all sections visible simultaneously.
 *
 * W3 AC-52: Content max-width 680px, centered.
 *
 * @lore W3: Replaces the tabbed settings navigation. The page renders all
 * sections in a stacked layout so users can scroll through them without
 * switching tabs. This matches the approved mockup for the settings screen.
 */

import type { JSX } from "react";
import { SettingsAgents } from "../settings/SettingsAgents.js";
import { SettingsAppearance } from "../settings/SettingsAppearance.js";
import { SettingsBackend } from "../settings/SettingsBackend.js";
import { SettingsModels } from "../settings/SettingsModels.js";
import { SettingsOrgChart } from "../settings/SettingsOrgChart.js";
import { SettingsProfile } from "../settings/SettingsProfile.js";

export function SettingsPage(): JSX.Element {
	return (
		<div data-testid="settings-page" className="flex flex-col h-full overflow-y-auto">
			{/* W3 AC-52: max-width 680px centered body */}
			<div
				data-testid="settings-body"
				className="flex flex-col gap-8 max-w-[680px] mx-auto w-full px-[24px] py-[24px]"
			>
				{/* W3 AC-47: Profile section */}
				<section data-testid="settings-section-profile" className="flex flex-col gap-3">
					<h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Profile</h2>
					<SettingsProfile />
				</section>

				{/* W3 AC-47 / AC-49: Org chart section */}
				<section data-testid="settings-section-org-chart" className="flex flex-col gap-3">
					<h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Org chart</h2>
					<SettingsOrgChart />
				</section>

				{/* X3: Agents section */}
				<section data-testid="settings-section-agents" className="flex flex-col gap-3">
					<h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Agents</h2>
					<SettingsAgents />
				</section>

				{/* X4: Models section */}
				<section data-testid="settings-section-models" className="flex flex-col gap-3">
					<h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Models</h2>
					<SettingsModels />
				</section>

				{/* W3 AC-47: Appearance section */}
				<section data-testid="settings-section-appearance" className="flex flex-col gap-3">
					<h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Appearance</h2>
					<SettingsAppearance />
				</section>

				{/* W3 AC-47 / AC-51: Backend section */}
				<section data-testid="settings-section-backend" className="flex flex-col gap-3">
					<h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Backend</h2>
					<SettingsBackend />
				</section>
			</div>
		</div>
	);
}
