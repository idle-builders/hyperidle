/**
 * SubscriptionsSection stories.
 *
 */

import type { JSX, ReactNode } from "react";
import { ToastRegion } from "../shell/ToastRegion.js";
import { type SubscriptionRow, SubscriptionsSection } from "./SubscriptionsSection.js";

function WithToast({ children }: { children: ReactNode }): JSX.Element {
	return <ToastRegion>{children}</ToastRegion>;
}

const POPULATED: SubscriptionRow[] = [
	{ id: "sub-1", event: "task.changed", schedule: null, paused: false, documentId: "doc-1" },
	{ id: "sub-2", event: null, schedule: "0 9 * * 1", paused: true, documentId: null },
];

export default { title: "Page: Agents/SubscriptionsSection" };

/** A mix of an active event subscription and a paused schedule subscription. */
export const Populated = (): JSX.Element => (
	<WithToast>
		<SubscriptionsSection userId="agent-1" subscriptions={POPULATED} onChanged={() => {}} />
	</WithToast>
);

/** No subscriptions yet. */
export const Empty = (): JSX.Element => (
	<WithToast>
		<SubscriptionsSection userId="agent-1" subscriptions={[]} onChanged={() => {}} />
	</WithToast>
);
