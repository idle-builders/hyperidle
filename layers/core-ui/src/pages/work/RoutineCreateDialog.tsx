/**
 * AA2 — RoutineCreateDialog: routine creation flow.
 *
 * Opens as a Dialog primitive. Fields: name, prompt, "When" (schedule or
 * event), agent select.
 *
 * @lore AA2: SCHEDULE_PRESETS are imported from @hyperidle/domain-model so the
 * same cron expressions are used across frontend and backend validation.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() to Dialog primitive.
 * isDirty = name or prompt non-empty. Authoring surface — guards on
 * dismissal when dirty.
 *
 * @lore AU21 Increment 14a: the "Cost cap per run" / "Monthly cost cap"
 * inputs (AA3) are HARD-DELETED along with the rest of the cost-cap
 * feature — `costCapPerRunMinor`/`costCapMonthlyMinor` are no longer
 * accepted by POST /api/routines, no replacement.
 *
 * @lore BA1 D5: the `teams` prop is GONE — a routine has no team, it belongs
 * to its owner agent, and appears on a team's page only if that agent
 * belongs to that team. The agent picker is now the only scope input.
 * @lore BA1 D8: the team `Select` is replaced by a "When" `Select`
 * (schedule / event). Event names come from `GET /api/routines/event-types`
 * — `core-ui` cannot import `@hyperidle/event-bus` directly
 * (`architecture.json` excludes it), so this is the one live source.
 *
 * @lore BA1 review (decision recorded, not fixed here): this dialog is
 * reachable only from `WorkTeam.tsx`'s `createRoutineOpen` mount and its
 * `agents` prop is that ONE team's roster, so an individual or team-less
 * agent — belonging D5/D6 explicitly make legal, the exact case the
 * nullable-`team_id` work exists for — has no UI path to author a routine
 * for itself at all; only `create_routine` (the agent tool) can. Widening
 * this to a global entry point needs a new mount (it is not just a wider
 * `agents` prop — WorkTeam has no reason to list every agent in the
 * product), which is a scoped feature on its own, not a review-fix-sized
 * change to an existing dialog. Left unmounted-elsewhere deliberately;
 * flagged for a future work package rather than widened here.
 *
 * @lore BA6: the agent field is now the shared `Combobox` (client-filtered —
 * `agents` is already the full roster this dialog is scoped to) instead of
 * a closed `<Select>`. The "When" / "Schedule" / "Event" selects stay —
 * short fixed lists, not entity pickers.
 */

import { SCHEDULE_PRESETS } from "@hyperidle/domain-model";
import { type JSX, useEffect, useState } from "react";
import { Button, Combobox, Dialog, Input, Select } from "../../ds";
import { apiFetch } from "../../services/api-fetch.js";

export interface RoutineCreateDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	agents: { id: string; name: string }[];
}

const INITIAL_CRON = SCHEDULE_PRESETS[0].cron;

type WhenMode = "schedule" | "event";

export function RoutineCreateDialog({
	open,
	onClose,
	onCreated,
	agents,
}: RoutineCreateDialogProps): JSX.Element | null {
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [agentId, setAgentId] = useState("");
	// "custom" is the sentinel value for the custom cron input
	const [scheduleValue, setScheduleValue] = useState<string>(INITIAL_CRON);
	const [customCron, setCustomCron] = useState("");
	const [whenMode, setWhenMode] = useState<WhenMode>("schedule");
	const [eventTypes, setEventTypes] = useState<readonly string[]>([]);
	const [eventType, setEventType] = useState("");
	// BA9d D11: optional transition constraint — fires only when the event
	// transitions to this state. Empty means no constraint.
	const [transitionTo, setTransitionTo] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isCustom = scheduleValue === "custom";
	const resolvedCron = isCustom ? customCron.trim() : scheduleValue;

	const isDirty = name.trim().length > 0 || prompt.trim().length > 0;

	// Create button enabled when required fields are filled
	const canCreate =
		name.trim().length > 0 &&
		agentId.trim().length > 0 &&
		(whenMode === "schedule" ? resolvedCron.trim().length > 0 : eventType.trim().length > 0) &&
		!submitting;

	// Fetch the event vocabulary once — the one list BA1 D8 makes authorable.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void (async () => {
			try {
				const res = await apiFetch("/api/routines/event-types");
				if (!res?.ok || cancelled) return;
				const body = (await res.json()) as { eventTypes?: string[] } | null;
				if (!cancelled && body?.eventTypes) setEventTypes(body.eventTypes);
			} catch {
				// The "When" select still renders — an empty options list, not a crash.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open]);

	// Reset form state on open.
	useEffect(() => {
		if (open) {
			setName("");
			setPrompt("");
			setAgentId("");
			setScheduleValue(INITIAL_CRON);
			setCustomCron("");
			setWhenMode("schedule");
			setEventType("");
			setTransitionTo("");
			setError(null);
			setSubmitting(false);
		}
	}, [open]);

	const handleSubmit = async (): Promise<void> => {
		const trimmedName = name.trim();
		if (!(trimmedName && agentId.trim())) return;
		if (whenMode === "schedule" && !resolvedCron.trim()) return;
		if (whenMode === "event" && !eventType.trim()) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> =
			whenMode === "schedule"
				? {
						name: trimmedName,
						prompt: prompt.trim() || undefined,
						ownerAgentId: agentId,
						triggerType: "calendar",
						triggerConfig: JSON.stringify({ cron: resolvedCron }),
					}
				: {
						name: trimmedName,
						prompt: prompt.trim() || undefined,
						ownerAgentId: agentId,
						triggerType: "event",
						eventType,
						// BA9d D11: include transition constraint when set
						...(transitionTo.trim() ? { eventTransitionTo: transitionTo.trim() } : {}),
					};

		const res = await apiFetch("/api/routines", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to create routine: ${res.status}`);
			setSubmitting(false);
			return;
		}

		setSubmitting(false);
		onCreated();
		onClose();
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="New routine"
			isDirty={isDirty}
			size="md"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						onClick={() => void handleSubmit()}
						disabled={!canCreate}
					>
						{submitting ? "…" : "Create"}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-[9px]">
				{/* Name field */}
				<Input
					label="Name (required)"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Daily digest"
					disabled={submitting}
				/>

				{/* Prompt field */}
				<Input
					textarea
					label="Prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Instruction for the agent when this routine fires"
					disabled={submitting}
					rows={2}
				/>

				{/* Agent picker.
				 * @lore: this Combobox must NOT sit inside a <label> — clicking an
				 * option commits and closes the popover, then the browser's label
				 * click-activation clicks the trigger and reopens it. Name it via
				 * Combobox's own `label` prop instead (renders a real
				 * `<label htmlFor>` pointing at the trigger, so it's still
				 * `getByLabelText`-reachable without the wrapping element). */}
				<Combobox
					id="routine-create-agent"
					label="Agent"
					options={agents.map((a) => ({ id: a.id, label: a.name }))}
					value={agentId}
					onChange={setAgentId}
					disabled={submitting}
					placeholder="Select an agent…"
					listAriaLabel="Agents"
					inputAriaLabel="Filter agents"
				/>

				{/* When select — schedule or event */}
				<label htmlFor="routine-create-when" className="flex flex-col gap-[3px]">
					<span className="type-metadata  text-[var(--text-tertiary)]">
						When <span aria-hidden>(required)</span>
					</span>
					<Select
						id="routine-create-when"
						size="sm"
						className="w-full"
						value={whenMode}
						onChange={(e) => setWhenMode(e.target.value as WhenMode)}
						disabled={submitting}
						aria-label="When"
						options={[
							{ value: "schedule", label: "On a schedule" },
							{ value: "event", label: "On an event" },
						]}
					/>
				</label>

				{whenMode === "schedule" ? (
					<>
						{/* Schedule picker */}
						<label htmlFor="routine-create-schedule" className="flex flex-col gap-[3px]">
							<span className="type-metadata  text-[var(--text-tertiary)]">
								Schedule <span aria-hidden>(required)</span>
							</span>
							<Select
								id="routine-create-schedule"
								size="sm"
								className="w-full"
								value={scheduleValue}
								onChange={(e) => setScheduleValue(e.target.value)}
								disabled={submitting}
								aria-label="Schedule"
								options={[
									...SCHEDULE_PRESETS.map((preset) => ({
										value: preset.cron,
										label: preset.label,
									})),
									{ value: "custom", label: "Custom…" },
								]}
							/>
						</label>

						{/* Custom cron input — shown only when "Custom..." selected */}
						{isCustom && (
							// @lore AZ7: font-mono was on the raw <input> chrome; Input's
							// className prop styles its wrapper div, not the inner
							// <input> (Input.tsx has no per-field class override), so a
							// monospace cron field is a small, accepted visual delta
							// here — not worth widening Input's API for one caller.
							<Input
								label="Custom cron expression"
								type="text"
								value={customCron}
								onChange={(e) => setCustomCron(e.target.value)}
								placeholder="cron: * * * * *"
								disabled={submitting}
							/>
						)}
					</>
				) : (
					<>
						<label htmlFor="routine-create-event" className="flex flex-col gap-[3px]">
							<span className="type-metadata  text-[var(--text-tertiary)]">
								Event <span aria-hidden>(required)</span>
							</span>
							<Select
								id="routine-create-event"
								size="sm"
								className="w-full"
								value={eventType}
								onChange={(e) => setEventType(e.target.value)}
								disabled={submitting}
								aria-label="Event"
								placeholder="Select an event…"
								options={eventTypes.map((e) => ({ value: e, label: e }))}
							/>
						</label>
						{/* BA9d D11: optional transition constraint */}
						<Input
							label="Only when transitioning to (optional)"
							type="text"
							value={transitionTo}
							onChange={(e) => setTransitionTo(e.target.value)}
							placeholder="e.g. done"
							disabled={submitting}
							aria-label="Transition to state"
						/>
					</>
				)}

				{error && (
					<p role="alert" className="type-metadata  text-error">
						{error}
					</p>
				)}
			</div>
		</Dialog>
	);
}
