// @lore: max-w-[720px] no mx-auto — left-aligns with PageHeader title; mx-auto would create different left edge than the title

import type { JSX } from "react";
import { PageHeader, PageScaffold } from "../ds";
import { SettingsAgents } from "../settings/SettingsAgents.js";
import { SettingsAppearance } from "../settings/SettingsAppearance.js";
import { SettingsBackend } from "../settings/SettingsBackend.js";
import { SettingsConnections } from "../settings/SettingsConnections.js";
import { SettingsFilesystems } from "../settings/SettingsFilesystems.js";
import { SettingsHarnesses } from "../settings/SettingsHarnesses.js";
import { SettingsNotifications } from "../settings/SettingsNotifications.js";
import { SettingsOrgChart } from "../settings/SettingsOrgChart.js";
import { SettingsPlugins } from "../settings/SettingsPlugins.js";
import { SettingsProfile } from "../settings/SettingsProfile.js";
import { SettingsSkillsAndRules } from "../settings/SettingsSkillsAndRules.js";
import { SettingsWorker } from "../settings/SettingsWorker.js";

function SectionTitle({ children }: { children: string }): JSX.Element {
	return <h2 className="type-label uppercase text-[var(--text-tertiary)] pb-[4px]">{children}</h2>;
}

export function SettingsPage(): JSX.Element {
	return (
		<PageScaffold
			frame="page"
			data-testid="settings-page"
			header={
				<PageHeader title="Settings" subtitle="Manage your profile, team, and app preferences." />
			}
		>
			<div
				data-testid="settings-body"
				className="flex flex-col gap-[48px] max-w-[720px] w-full py-[24px]"
			>
				{/* ── Group 1: Identity ───────────────────────────────────────────── */}
				<div className="flex flex-col gap-[24px]">
					<section
						id="settings-section-profile"
						data-testid="settings-section-profile"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Profile</SectionTitle>
						<SettingsProfile />
					</section>

					<section
						id="settings-section-orgchart"
						data-testid="settings-section-org-chart"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Org chart</SectionTitle>
						<SettingsOrgChart />
					</section>
				</div>

				{/* ── Group 2: Agents & backends ──────────────────────────────────── */}
				<div className="flex flex-col gap-[24px]">
					<section
						id="settings-section-agents"
						data-testid="settings-section-agents"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Agents</SectionTitle>
						<SettingsAgents />
					</section>

					<section
						id="settings-section-skills"
						data-testid="settings-section-skills"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Skills & rules</SectionTitle>
						<SettingsSkillsAndRules />
					</section>

					<section
						id="settings-section-plugins"
						data-testid="settings-section-plugins"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Plugins</SectionTitle>
						<SettingsPlugins />
					</section>

					<section
						id="settings-section-filesystems"
						data-testid="settings-section-filesystems"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Filesystems</SectionTitle>
						<SettingsFilesystems />
					</section>

					<section
						id="settings-section-agent-backends"
						data-testid="settings-section-agent-backends"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Agent backends</SectionTitle>
						<SettingsHarnesses />
					</section>
				</div>

				{/* ── Group 3: Preferences ────────────────────────────────────────── */}
				<div className="flex flex-col gap-[24px]">
					{/* SettingsConnections owns its own heading — no SectionTitle wrapper */}
					<section
						id="settings-section-connections"
						data-testid="settings-section-connections"
						className="flex flex-col"
					>
						<SettingsConnections />
					</section>

					<section
						id="settings-section-appearance"
						data-testid="settings-section-appearance"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Appearance</SectionTitle>
						<SettingsAppearance />
					</section>

					<section
						id="settings-section-notifications"
						data-testid="settings-section-notifications"
						className="flex flex-col gap-[9px]"
					>
						<SectionTitle>Notifications</SectionTitle>
						<SettingsNotifications />
					</section>

					{/* @lore: backend section — SettingsBackend + SettingsWorker separated; two distinct sub-areas not one undifferentiated list */}
					<section
						id="settings-section-backend"
						data-testid="settings-section-backend"
						className="flex flex-col gap-[18px]"
					>
						<SectionTitle>Backend</SectionTitle>
						<SettingsBackend />
						<div className="border-width-thin-t flex flex-col gap-[12px] border-[var(--border-subtle)] pt-[18px]">
							<span className="type-label uppercase text-[var(--text-tertiary)]">Worker</span>
							<SettingsWorker />
						</div>
					</section>
				</div>
			</div>
		</PageScaffold>
	);
}
