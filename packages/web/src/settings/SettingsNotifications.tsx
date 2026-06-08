/**
 * SettingsNotifications — Notifications settings section.
 *
 * Four toggles matching the settings.html mockup:
 *   - Review requests  → server field: notifications.reviewAlerts
 *   - Cost alerts      → server field: notifications.costAlerts
 *   - Blocker notifications → server field: notifications.blockerAlerts
 *   - Email digests    → local-only (no server field)
 *
 * Reads initial values from the server via useSettings on mount.
 * Calls save() on each toggle change for the three mapped toggles.
 * email-digests is kept in local state only (no persistence endpoint).
 *
 * @lore AD5 AC-3: wired to useSettings so notification prefs persist across
 * page refresh. email-digests has no server field — it stays local-only.
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
import { type JSX, useEffect, useMemo, useState } from "react";
import { useSettings } from "../hooks/useSettings.js";
import type { NotificationSettings, SettingsData } from "./settings-types.js";
import { useHumanCount } from "./useHumanCount.js";

interface NotificationSetting {
	key: string;
	label: string;
	description: string;
	defaultOn: boolean;
}

/**
 * Maps UI toggle keys to server-side NotificationSettings fields.
 * Keys not present here are local-only (email-digests).
 */
const SERVER_KEY_MAP: Readonly<Record<string, keyof NotificationSettings>> = {
	"review-requests": "reviewAlerts",
	"cost-alerts": "costAlerts",
	"blocker-notifications": "blockerAlerts",
};

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

	const { settings, save } = useSettings();

	const [values, setValues] = useState<Record<string, boolean>>(
		Object.fromEntries(NOTIFICATION_SETTINGS.map((s) => [s.key, s.defaultOn])),
	);

	// Sync with server values when settings load
	useEffect(() => {
		if (!settings) return;
		const { notifications } = settings;
		setValues((prev) => ({
			...prev,
			"review-requests": notifications.reviewAlerts,
			"cost-alerts": notifications.costAlerts,
			"blocker-notifications": notifications.blockerAlerts,
		}));
	}, [settings]);

	const handleChange = (key: string, on: boolean): void => {
		setValues((prev) => ({ ...prev, [key]: on }));

		const serverField = SERVER_KEY_MAP[key];
		if (!(serverField && settings)) return;

		// Build the updated SettingsData with the changed notification field
		const updated: SettingsData = {
			...settings,
			notifications: {
				...settings.notifications,
				[serverField]: on,
			},
		};
		void save(updated);
	};

	return (
		<div className="flex flex-col gap-[18px]">
			{visibleSettings.map((setting) => (
				<Toggle
					key={setting.key}
					on={values[setting.key] ?? setting.defaultOn}
					label={setting.label}
					description={setting.description}
					onChange={(on) => handleChange(setting.key, on)}
				/>
			))}
		</div>
	);
}
