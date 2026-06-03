/**
 * SettingsNotifications — Notifications settings section.
 *
 * Four toggles matching the settings.html mockup:
 *   - Review requests (default on)
 *   - Cost alerts (default on)
 *   - Blocker notifications (default off)
 *   - Email digests (default off)
 *
 * State is local-only for now — no persistence endpoint exists yet.
 *
 * @lore visual-parity: Uses design-system Toggle component to match
 * the toggle-row pattern in settings.html exactly.
 */

import { Toggle } from "@hyperidle/design-system";
import { type JSX, useState } from "react";

interface NotificationSetting {
	key: string;
	label: string;
	description: string;
	defaultOn: boolean;
}

const NOTIFICATION_SETTINGS: NotificationSetting[] = [
	{
		key: "review-requests",
		label: "Review requests",
		description: "Get notified when an agent needs your review",
		defaultOn: true,
	},
	{
		key: "cost-alerts",
		label: "Cost alerts",
		description: "Notify when a bet exceeds 80% of its budget",
		defaultOn: true,
	},
	{
		key: "blocker-notifications",
		label: "Blocker notifications",
		description: "Alert when an agent is blocked and needs intervention",
		defaultOn: false,
	},
	{
		key: "email-digests",
		label: "Email digests",
		description: "Receive a daily email summary of unread threads",
		defaultOn: false,
	},
];

export function SettingsNotifications(): JSX.Element {
	const [values, setValues] = useState<Record<string, boolean>>(
		Object.fromEntries(NOTIFICATION_SETTINGS.map((s) => [s.key, s.defaultOn])),
	);

	return (
		<div className="flex flex-col gap-[18px]">
			{NOTIFICATION_SETTINGS.map((setting) => (
				<Toggle
					key={setting.key}
					on={values[setting.key]}
					label={setting.label}
					description={setting.description}
					onChange={(on) => setValues((prev) => ({ ...prev, [setting.key]: on }))}
				/>
			))}
		</div>
	);
}
