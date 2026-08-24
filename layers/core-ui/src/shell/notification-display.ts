/**
 * @lore AU44-b8: shortLabelForType moved from framework/domain-model/src/notifications.ts.
 * Only NotificationPopover uses it. Audit row 27: MERGE → design-system (=core-ui).
 */

import type { NotificationTypeKey } from "@hyperidle/domain-model";
import { NOTIFICATION_TYPES } from "@hyperidle/domain-model";

export function shortLabelForType(key: NotificationTypeKey): string {
	const entry = NOTIFICATION_TYPES.find((t) => t.key === key);
	return entry?.shortLabel ?? key;
}
