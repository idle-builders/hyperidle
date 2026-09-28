import { OBJECT_EVENTS, type ObjectEventName } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { Button, Input, ItemList, Row, SectionLabel, Select } from "../ds";
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";

export interface SubscriptionRow {
	readonly id: string;
	readonly event: ObjectEventName | null;
	readonly schedule: string | null;
	readonly paused: boolean;
	readonly documentId: string | null;
}

export interface SubscriptionsSectionProps {
	userId: string;
	subscriptions: readonly SubscriptionRow[];
	onChanged: () => void;
}

type WhenMode = "event" | "schedule";

export function SubscriptionsSection({
	userId,
	subscriptions,
	onChanged,
}: SubscriptionsSectionProps): JSX.Element {
	const { showToast } = useToast();
	const [adding, setAdding] = useState(false);
	const [whenMode, setWhenMode] = useState<WhenMode>("event");
	const [event, setEvent] = useState<ObjectEventName>(OBJECT_EVENTS[0]);
	const [cron, setCron] = useState("");
	const [prompt, setPrompt] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const canAdd = whenMode === "event" ? true : cron.trim().length > 0;

	const resetAddForm = (): void => {
		setWhenMode("event");
		setEvent(OBJECT_EVENTS[0]);
		setCron("");
		setPrompt("");
		setAddError(null);
	};

	const handleAdd = async (): Promise<void> => {
		setSubmitting(true);
		setAddError(null);
		const promptValue = prompt.trim().length > 0 ? prompt.trim() : null;
		const result = await call("edit_user", {
			id: userId,
			subscriptions: {
				add: [
					whenMode === "event"
						? { event, prompt: promptValue }
						: { schedule: cron.trim(), prompt: promptValue },
				],
			},
		});
		setSubmitting(false);
		if (!result.ok) {
			setAddError(result.problems[0]?.message ?? "Failed to add subscription.");
			return;
		}
		resetAddForm();
		setAdding(false);
		showToast("Subscription added");
		onChanged();
	};

	const handleTogglePause = async (sub: SubscriptionRow): Promise<void> => {
		setBusyId(sub.id);
		const result = await call("edit_user", {
			id: userId,
			subscriptions: { change: [{ id: sub.id, paused: !sub.paused }] },
		});
		setBusyId(null);
		if (!result.ok) {
			showToast("Failed to update subscription");
			return;
		}
		showToast(sub.paused ? "Subscription resumed" : "Subscription paused");
		onChanged();
	};

	const handleRemove = async (sub: SubscriptionRow): Promise<void> => {
		setBusyId(sub.id);
		const result = await call("edit_user", { id: userId, subscriptions: { remove: [sub.id] } });
		setBusyId(null);
		if (!result.ok) {
			showToast("Failed to remove subscription");
			return;
		}
		showToast("Subscription removed");
		onChanged();
	};

	return (
		<section
			aria-label="Subscriptions"
			data-testid="agent-subscriptions-section"
			className="flex flex-col gap-[12px]"
		>
			<SectionLabel
				label="Subscriptions"
				as="h2"
				trailing={
					<Button
						variant="ghost"
						size="sm"
						type="button"
						data-testid="new-subscription-btn"
						onClick={() => {
							if (adding) resetAddForm();
							setAdding((v) => !v);
						}}
					>
						{adding ? "Cancel" : "+ Add subscription"}
					</Button>
				}
			/>

			<ItemList
				variant="flush"
				isEmpty={subscriptions.length === 0}
				empty={{
					title: "No subscriptions",
					description: "This agent is not subscribed to anything yet.",
				}}
			>
				{subscriptions.map((sub) => (
					<Row
						key={sub.id}
						data-testid="subscription-row"
						title={sub.event ?? sub.schedule ?? "—"}
						cells={[{ content: sub.paused ? "Paused" : "Active" }]}
						actions={
							<div className="flex gap-[6px]">
								<Button
									variant="ghost"
									size="sm"
									type="button"
									data-testid="subscription-pause-btn"
									disabled={busyId === sub.id}
									onClick={() => void handleTogglePause(sub)}
								>
									{sub.paused ? "Resume" : "Pause"}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									data-testid="subscription-remove-btn"
									disabled={busyId === sub.id}
									onClick={() => void handleRemove(sub)}
								>
									Remove
								</Button>
							</div>
						}
					/>
				))}
			</ItemList>

			{adding && (
				<div className="border-width-thin flex flex-col gap-[9px] p-[12px]  border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
					<label htmlFor="subscription-when" className="flex flex-col gap-[3px]">
						<span className="type-metadata  text-[var(--text-tertiary)]">When</span>
						<Select
							id="subscription-when"
							size="sm"
							className="w-full"
							value={whenMode}
							disabled={submitting}
							aria-label="When"
							onChange={(e) => setWhenMode(e.target.value as WhenMode)}
							options={[
								{ value: "event", label: "On an event" },
								{ value: "schedule", label: "On a schedule" },
							]}
						/>
					</label>

					{whenMode === "event" ? (
						<label htmlFor="subscription-event" className="flex flex-col gap-[3px]">
							<span className="type-metadata  text-[var(--text-tertiary)]">Event</span>
							<Select
								id="subscription-event"
								size="sm"
								className="w-full"
								value={event}
								disabled={submitting}
								aria-label="Event"
								onChange={(e) => setEvent(e.target.value as ObjectEventName)}
								options={OBJECT_EVENTS.map((name) => ({ value: name, label: name }))}
							/>
						</label>
					) : (
						<Input
							label="Cron expression"
							type="text"
							value={cron}
							onChange={(e) => setCron(e.target.value)}
							placeholder="* * * * *"
							disabled={submitting}
						/>
					)}

					<Input
						textarea
						label="Prompt (optional)"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Instruction for the agent when this subscription fires"
						disabled={submitting}
						rows={2}
					/>

					{addError && (
						<p role="alert" className="type-metadata  text-[var(--status-error)]">
							{addError}
						</p>
					)}

					<div className="flex gap-[9px] justify-end">
						<Button
							variant="ghost"
							size="sm"
							type="button"
							onClick={() => {
								resetAddForm();
								setAdding(false);
							}}
							disabled={submitting}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							type="button"
							data-testid="subscription-create-submit"
							onClick={() => void handleAdd()}
							disabled={!canAdd || submitting}
						>
							{submitting && <span className="loading loading-spinner loading-xs" />}
							Add
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
