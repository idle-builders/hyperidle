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
 *
 * @lore AD3 AC-4: In solo mode (humanCount <= 1), only toggles relevant to a
 * single-user context are shown (review-requests, cost-alerts). Blocker
 * notifications and email digests require teammates or scheduled digests
 * that don't apply to a solo founder. Fail-open: when humanCount is null
 * (loading or error), all 4 toggles are shown — a momentary blip should not
 * hide notification settings from a team user.
 */

import { Toggle } from "@hyperidle/design-system";
import { type JSX, useMemo, useState } from "react";
import { useHumanCount } from "./useHumanCount.js";

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

// AD3 AC-4: Keys visible in solo mode (humanCount <= 1).
const SOLO_NOTIFICATION_KEYS = new Set(["review-requests", "cost-alerts"]);

export function SettingsNotifications(): JSX.Element {
	const { humanCount } = useHumanCount();
	// Fail-open: null means loading/error — show all toggles rather than hiding from team users.
	const isSolo = humanCount !== null && humanCount <= 1;

	const visibleSettings = useMemo(
		() =>
			isSolo
				? NOTIFICATION_SETTINGS.filter((s) => SOLO_NOTIFICATION_KEYS.has(s.key))
				: NOTIFICATION_SETTINGS,
		[isSolo],
	);

	const [values, setValues] = useState<Record<string, boolean>>(
		Object.fromEntries(NOTIFICATION_SETTINGS.map((s) => [s.key, s.defaultOn])),
	);

	return (
		<div className="flex flex-col gap-[18px]">
			{visibleSettings.map((setting) => (
				<Toggle
					key={setting.key}
					on={values[setting.key] ?? setting.defaultOn}
					label={setting.label}
					description={setting.description}
					onChange={(on) => setValues((prev) => ({ ...prev, [setting.key]: on }))}
				/>
			))}
		</div>
	);
}
