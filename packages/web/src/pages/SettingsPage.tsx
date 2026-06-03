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
import { CredentialsTab } from "../components/CredentialsTab.js";
import { SettingsAppearance } from "../settings/SettingsAppearance.js";
import { SettingsBackend } from "../settings/SettingsBackend.js";
import { SettingsNotifications } from "../settings/SettingsNotifications.js";
import { SettingsOrgChart } from "../settings/SettingsOrgChart.js";
import { SettingsProfile } from "../settings/SettingsProfile.js";

/** Shared section title style: 13px/600 uppercase, text-tertiary, border-bottom */
function SectionTitle({ children }: { children: string }): JSX.Element {
	return (
		<h2 className="text-[13px] font-[600] uppercase tracking-[0.06em] text-[var(--text-tertiary)] pb-[6px] border-b border-[var(--border-subtle)]">
			{children}
		</h2>
	);
}

export function SettingsPage(): JSX.Element {
	return (
		<div data-testid="settings-page" className="flex flex-col h-full">
			{/* Settings header */}
			<header className="shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
				<h2 className="text-[20px] font-[600] tracking-[-0.01em]">Settings</h2>
				<p className="text-[13px] text-[var(--text-tertiary)] mt-[3px]">
					Manage your profile, team, and app preferences.
				</p>
			</header>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto">
				<div
					data-testid="settings-body"
					className="flex flex-col gap-[24px] max-w-[680px] mx-auto w-full px-[24px] py-[24px]"
				>
					{/* W3 AC-47: Profile section */}
					<section data-testid="settings-section-profile" className="flex flex-col gap-[18px]">
						<SectionTitle>Profile</SectionTitle>
						<SettingsProfile />
					</section>

					{/* W3 AC-47 / AC-49: Org chart section */}
					<section data-testid="settings-section-org-chart" className="flex flex-col gap-[18px]">
						<SectionTitle>Org chart</SectionTitle>
						<SettingsOrgChart />
					</section>

					{/* W3 AC-47: Appearance section */}
					<section data-testid="settings-section-appearance" className="flex flex-col gap-[18px]">
						<SectionTitle>Appearance</SectionTitle>
						<SettingsAppearance />
					</section>

					{/* Credentials section — desktop only (CredentialsTab handles non-desktop gracefully) */}
					<section data-testid="settings-section-credentials" className="flex flex-col gap-[18px]">
						<SectionTitle>Credentials</SectionTitle>
						<CredentialsTab />
					</section>

					{/* Notifications section */}
					<section
						data-testid="settings-section-notifications"
						className="flex flex-col gap-[18px]"
					>
						<SectionTitle>Notifications</SectionTitle>
						<SettingsNotifications />
					</section>

					{/* W3 AC-47 / AC-51: Backend section */}
					<section data-testid="settings-section-backend" className="flex flex-col gap-[18px]">
						<SectionTitle>Backend</SectionTitle>
						<SettingsBackend />
					</section>
				</div>
			</div>
		</div>
	);
}
