import {
	OBJECT_EVENTS,
	type ObjectEventName,
	type SubscriptionView,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
import { ErrorState, SkeletonList, Toggle } from "../ds";
import { call } from "../services/call.js";

const EVENT_LABELS: Record<ObjectEventName, string> = {
	"task.created": "A task is created",
	"task.changed": "A task changes",
	"thread.created": "A conversation is created",
	"thread.message": "A conversation gets a message",
	"thread.changed": "A conversation changes",
	"document.created": "A document is created",
	"document.changed": "A document changes",
	"user.created": "A user is created",
	"user.changed": "A user changes",
};

type LoadState = "loading" | "ready" | "error";

export function SettingsNotifications(): JSX.Element {
	const [status, setStatus] = useState<LoadState>("loading");
	const [userId, setUserId] = useState<string | null>(null);
	const [subscriptions, setSubscriptions] = useState<SubscriptionView[]>([]);

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const result = await call("open_user", {});
			if (!result.ok || result.data.user === null) {
				setStatus("error");
				return;
			}
			setUserId(result.data.user.id);
			setSubscriptions([...result.data.subscriptions]);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const subscriptionForEvent = useCallback(
		(event: ObjectEventName): SubscriptionView | undefined =>
			subscriptions.find((sub) => sub.event === event),
		[subscriptions],
	);

	const setEventOn = useCallback(
		async (event: ObjectEventName, on: boolean): Promise<void> => {
			if (!userId) return;
			try {
				const existing = subscriptionForEvent(event);
				if (existing) {
					if (existing.paused === !on) return;
					const result = await call("edit_user", {
						id: userId,
						subscriptions: { change: [{ id: existing.id, paused: !on }] },
					});
					if (result.ok) setSubscriptions([...result.data.subscriptions]);
					return;
				}
				if (!on) return; // already off — nothing to pause
				const result = await call("edit_user", {
					id: userId,
					subscriptions: { add: [{ event }] },
				});
				if (result.ok) setSubscriptions([...result.data.subscriptions]);
			} catch {
				// Non-fatal — the toggle stays as it was
			}
		},
		[userId, subscriptionForEvent],
	);

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
			<p className="type-small text-[var(--text-secondary)]">
				Get notified when something happens, within your reach — global, your team, your own. Off
				pauses it.
			</p>
			{OBJECT_EVENTS.map((event) => {
				const existing = subscriptionForEvent(event);
				const on = existing !== undefined && !existing.paused;
				return (
					<Toggle
						key={event}
						on={on}
						label={EVENT_LABELS[event]}
						onChange={(nextOn) => void setEventOn(event, nextOn)}
					/>
				);
			})}
		</div>
	);
}
