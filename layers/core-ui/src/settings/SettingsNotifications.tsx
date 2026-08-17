/**
 * AF8 — SettingsNotifications rewrite.
 *
 * Registry-driven: renders one Toggle per NOTIFICATION_TYPES entry.
 * Uses useNotificationMute for mute state. No hardcoded array, no
 * SERVER_KEY_MAP, no email-digests, no solo-filter.
 *
 * @lore AF8: Old version used SERVER_KEY_MAP + hardcoded NOTIFICATION_SETTINGS
 * array with solo-mode filtering. This rewrite drives everything from the
 * shared NOTIFICATION_TYPES registry so adding a new type is a registry edit
 * only — no UI changes needed.
 *
 * @lore AF8: email-digests was a UI-only toggle with no server field. It is
 * removed because digest is an egress delivery mode, not a notification type.
 * The registry only contains notification sources (review_request,
 * blocker_alert). Digest delivery is controlled via the Notifications config
 * panel. @lore AU21 Increment 14a: `cost_alert` HARD-DELETED, no replacement.
 *
 * @lore AF15 coordination: useNotificationMute currently reads/writes
 * factory-level settings. AF15 will swap in per-user persistence without
 * changing this component.
 */

import { ErrorState, SkeletonList, Toggle } from "@hyperidle/design-system";
import { NOTIFICATION_TYPES } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { useNotificationMute } from "../hooks/useNotificationMute.js";

export function SettingsNotifications(): JSX.Element {
	const { mutedKeys, setMuted, status } = useNotificationMute();

	if (status === "loading") {
		return <SkeletonList rows={2} ariaLabel="Loading notification settings" />;
	}

	if (status === "error") {
		return (
			<ErrorState
				compact
				title="Couldn't load notifications"
				description="Failed to load notification settings. Please try again."
			/>
		);
	}

	return (
		<div className="flex flex-col gap-[18px]">
			{NOTIFICATION_TYPES.map((type) => {
				const isMuted = mutedKeys.includes(type.key);
				return (
					<Toggle
						key={type.key}
						on={!isMuted}
						label={type.label}
						description={type.description}
						onChange={(on) => void setMuted(type.key, !on)}
					/>
				);
			})}
		</div>
	);
}
