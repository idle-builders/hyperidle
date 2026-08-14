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

import { PageHeader, PageScaffold } from "@hyperidle/design-system";
import type { JSX } from "react";
import { CredentialsTab } from "../components/CredentialsTab.js";
import { SettingsAgentBehavior } from "../settings/SettingsAgentBehavior.js";
import { SettingsAgents } from "../settings/SettingsAgents.js";
import { SettingsAppearance } from "../settings/SettingsAppearance.js";
import { SettingsBackend } from "../settings/SettingsBackend.js";
import { SettingsConnections } from "../settings/SettingsConnections.js";
import { SettingsFilesystems } from "../settings/SettingsFilesystems.js";
import { SettingsHarnesses } from "../settings/SettingsHarnesses.js";
import { SettingsNotifications } from "../settings/SettingsNotifications.js";
import { SettingsOrgChart } from "../settings/SettingsOrgChart.js";
import { SettingsProfile } from "../settings/SettingsProfile.js";
import { SettingsWorker } from "../settings/SettingsWorker.js";

/** Shared section title style: 13px/600 uppercase, text-tertiary, border-bottom */
function SectionTitle({ children }: { children: string }): JSX.Element {
	return (
		<h2 className="border-b-[var(--bw-thin)] type-label   uppercase  text-[var(--text-tertiary)] pb-[6px]  border-[var(--border-subtle)]">
			{children}
		</h2>
	);
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
			<div data-testid="settings-body" className="flex flex-col gap-[24px] w-full py-[24px]">
				{/* W3 AC-47: Profile section */}
				<section
					id="settings-section-profile"
					data-testid="settings-section-profile"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Profile</SectionTitle>
					<SettingsProfile />
				</section>

				{/* W3 AC-47 / AC-49: Org chart section */}
				<section
					id="settings-section-orgchart"
					data-testid="settings-section-org-chart"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Org chart</SectionTitle>
					<SettingsOrgChart />
				</section>

				{/* AV2: Models section removed — model tiers moved into builtin harness detail in SettingsHarnesses */}

				{/* AV2: Agents section (was after Models) */}
				<section
					id="settings-section-agents"
					data-testid="settings-section-agents"
					className="flex flex-col gap-[9px] max-w-[960px] w-full"
				>
					<SectionTitle>Agents</SectionTitle>
					<SettingsAgents />
				</section>

				<section
					id="settings-section-agent-behavior"
					data-testid="settings-section-agent-behavior"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Agent behavior</SectionTitle>
					<SettingsAgentBehavior />
				</section>

				{/* AO1: Filesystems registry section — team-scoped file sources (code repos, doc sets).
					     Sibling of Harnesses/Models/Agents per approved design (plans/AO1/design/approved.md). */}
				<section
					id="settings-section-filesystems"
					data-testid="settings-section-filesystems"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Filesystems</SectionTitle>
					<SettingsFilesystems />
				</section>

				{/* AM4: Agent backends section — harness detection + enable/disable */}
				<section
					id="settings-section-agent-backends"
					data-testid="settings-section-agent-backends"
					className="flex flex-col gap-[9px] max-w-[960px] w-full"
				>
					<SectionTitle>Agent backends</SectionTitle>
					<SettingsHarnesses />
				</section>

				{/* AN1: Connections section — after Agent backends. SettingsConnections owns its own h2 heading,
					     so no SectionTitle wrapper here. */}
				<section
					id="settings-section-connections"
					data-testid="settings-section-connections"
					className="flex flex-col max-w-[680px] mx-auto w-full"
				>
					<SettingsConnections />
				</section>

				{/* AV2: Assistant section removed — assistant is now a row in Agents (SettingsAssistant deleted). */}

				{/* W3 AC-47: Appearance section */}
				<section
					id="settings-section-appearance"
					data-testid="settings-section-appearance"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Appearance</SectionTitle>
					<SettingsAppearance />
				</section>

				{/* Credentials section — desktop only (CredentialsTab handles non-desktop gracefully) */}
				<section
					id="settings-section-credentials"
					data-testid="settings-section-credentials"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Credentials</SectionTitle>
					<CredentialsTab />
				</section>

				{/* Notifications section */}
				<section
					id="settings-section-notifications"
					data-testid="settings-section-notifications"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Notifications</SectionTitle>
					<SettingsNotifications />
				</section>

				{/* W3 AC-47 / AC-51: Backend section — Worker folded in (shared-mode only; SettingsWorker self-gates). */}
				<section
					id="settings-section-backend"
					data-testid="settings-section-backend"
					className="flex flex-col gap-[9px] max-w-[680px] mx-auto w-full"
				>
					<SectionTitle>Backend</SectionTitle>
					<SettingsBackend />
					{/* AV2 sub-area (d): Worker folded under Backend. SettingsWorker self-gates to shared-mode Electron. */}
					<SettingsWorker />
				</section>
			</div>
		</PageScaffold>
	);
}
