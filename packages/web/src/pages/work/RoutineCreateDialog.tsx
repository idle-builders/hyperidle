/**
 * AA2 — RoutineCreateDialog: routine creation flow.
 *
 * Opens as a native <dialog>. Fields: name, description, schedule picker
 * (presets + custom cron), agent select, optional cost cap per run.
 *
 * Follows the BetCreateDialog pattern exactly (JSDOM guard, reset on open,
 * single team auto-resolve, onCreated callback).
 *
 * @lore AA2: SCHEDULE_PRESETS are imported from @hyperidle/shared so the
 * same cron expressions are used across frontend and backend validation.
 */

import { SCHEDULE_PRESETS } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../services/api-fetch.js";

export interface RoutineCreateDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	teams: { id: string; name: string }[];
	agents: { id: string; name: string }[];
}

const INITIAL_CRON = SCHEDULE_PRESETS[0].cron;

export function RoutineCreateDialog({
	open,
	onClose,
	onCreated,
	teams,
	agents,
}: RoutineCreateDialogProps): JSX.Element | null {
	const dialogRef = useRef<HTMLDialogElement>(null);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [agentId, setAgentId] = useState("");
	const [teamId, setTeamId] = useState("");
	// "custom" is the sentinel value for the custom cron input
	const [scheduleValue, setScheduleValue] = useState<string>(INITIAL_CRON);
	const [customCron, setCustomCron] = useState("");
	const [costCapRaw, setCostCapRaw] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const singleTeam = teams.length === 1;
	const resolvedTeamId = singleTeam ? (teams[0]?.id ?? "") : teamId;
	const isCustom = scheduleValue === "custom";
	const resolvedCron = isCustom ? customCron.trim() : scheduleValue;

	// Create button enabled when required fields are filled
	const canCreate =
		name.trim().length > 0 &&
		resolvedTeamId.trim().length > 0 &&
		agentId.trim().length > 0 &&
		resolvedCron.trim().length > 0 &&
		!submitting;

	// Sync the native dialog open/closed state with the `open` prop.
	// @lore Q3: same JSDOM guard as BetCreateDialog — showModal() is not
	// implemented in JSDOM so we fall back to setAttribute("open", "").
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			// Reset form state on open
			setName("");
			setDescription("");
			setAgentId("");
			setTeamId("");
			setScheduleValue(INITIAL_CRON);
			setCustomCron("");
			setCostCapRaw("");
			setError(null);
			setSubmitting(false);
			if (!dialogRef.current.open) {
				if (typeof dialogRef.current.showModal === "function") {
					dialogRef.current.showModal();
				} else {
					dialogRef.current.setAttribute("open", "");
				}
			}
		} else if (dialogRef.current.open) {
			if (typeof dialogRef.current.close === "function") {
				dialogRef.current.close();
			} else {
				dialogRef.current.removeAttribute("open");
			}
		}
	}, [open]);

	const handleSubmit = async (): Promise<void> => {
		const trimmedName = name.trim();
		if (!(trimmedName && resolvedTeamId.trim() && agentId.trim() && resolvedCron.trim())) return;

		setSubmitting(true);
		setError(null);

		const costCapMinor = costCapRaw.trim()
			? Math.round(Number.parseFloat(costCapRaw.trim()) * 100)
			: null;

		const payload: Record<string, unknown> = {
			name: trimmedName,
			description: description.trim() || undefined,
			teamId: resolvedTeamId,
			ownerAgentId: agentId,
			triggerType: "calendar",
			triggerConfig: JSON.stringify({ cron: resolvedCron }),
			...(costCapMinor !== null ? { costCapPerRunMinor: costCapMinor } : {}),
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

	const handleCancel = (): void => {
		if (submitting) return;
		onClose();
	};

	return (
		<dialog ref={dialogRef} aria-modal="true" aria-label="Create new routine">
			{open && (
				<div className="p-[18px] flex flex-col gap-[9px] min-w-[320px] max-w-[480px] w-full">
					<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">
						New routine
					</h2>

					{/* Name field */}
					<label className="flex flex-col gap-[3px]">
						<span className="text-xs text-[var(--text-tertiary)]">
							Name <span aria-hidden>(required)</span>
						</span>
						<input
							type="text"
							className="input input-bordered input-sm text-base w-full"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Daily digest"
							disabled={submitting}
							aria-label="Name"
						/>
					</label>

					{/* Description field */}
					<label className="flex flex-col gap-[3px]">
						<span className="text-xs text-[var(--text-tertiary)]">Description</span>
						<textarea
							className="textarea textarea-bordered textarea-sm text-base w-full"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Description of what this routine does"
							disabled={submitting}
							rows={2}
						/>
					</label>

					{/* Team select — only shown when multiple teams */}
					{teams.length > 1 && (
						<label className="flex flex-col gap-[3px]">
							<span className="text-xs text-[var(--text-tertiary)]">
								Team <span aria-hidden>(required)</span>
							</span>
							<select
								className="select select-bordered select-sm text-base w-full"
								value={teamId}
								onChange={(e) => setTeamId(e.target.value)}
								disabled={submitting}
							>
								<option value="">Select a team…</option>
								{teams.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
							</select>
						</label>
					)}

					{/* Agent select */}
					<label className="flex flex-col gap-[3px]">
						<span className="text-xs text-[var(--text-tertiary)]">
							Agent <span aria-hidden>(required)</span>
						</span>
						<select
							className="select select-bordered select-sm text-base w-full"
							value={agentId}
							onChange={(e) => setAgentId(e.target.value)}
							disabled={submitting}
							aria-label="Agent"
						>
							<option value="">Select an agent…</option>
							{agents.map((a) => (
								<option key={a.id} value={a.id}>
									{a.name}
								</option>
							))}
						</select>
					</label>

					{/* Schedule picker */}
					<label className="flex flex-col gap-[3px]">
						<span className="text-xs text-[var(--text-tertiary)]">
							Schedule <span aria-hidden>(required)</span>
						</span>
						<select
							className="select select-bordered select-sm text-base w-full"
							value={scheduleValue}
							onChange={(e) => setScheduleValue(e.target.value)}
							disabled={submitting}
							aria-label="Schedule"
						>
							{SCHEDULE_PRESETS.map((preset) => (
								<option key={preset.cron} value={preset.cron}>
									{preset.label}
								</option>
							))}
							<option value="custom">Custom…</option>
						</select>
					</label>

					{/* Custom cron input — shown only when "Custom..." selected */}
					{isCustom && (
						<label className="flex flex-col gap-[3px]">
							<span className="text-xs text-[var(--text-tertiary)]">Custom cron expression</span>
							<input
								type="text"
								className="input input-bordered input-sm font-mono text-base w-full"
								value={customCron}
								onChange={(e) => setCustomCron(e.target.value)}
								placeholder="cron: * * * * *"
								disabled={submitting}
							/>
						</label>
					)}

					{/* Cost cap per run */}
					<label className="flex flex-col gap-[3px]">
						<span className="text-xs text-[var(--text-tertiary)]">
							Cost cap per run (USD, optional)
						</span>
						<input
							type="number"
							className="input input-bordered input-sm text-base w-full"
							value={costCapRaw}
							onChange={(e) => setCostCapRaw(e.target.value)}
							placeholder="e.g. 0.50"
							disabled={submitting}
							min="0"
							step="0.01"
							aria-label="Cost cap per run"
						/>
					</label>

					{error && (
						<p role="alert" className="text-xs text-error">
							{error}
						</p>
					)}

					<div className="flex gap-[9px] justify-end mt-[9px]">
						<button
							type="button"
							className="btn btn-sm btn-ghost min-h-[44px]"
							onClick={handleCancel}
							disabled={submitting}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-sm btn-primary min-h-[44px]"
							onClick={() => void handleSubmit()}
							disabled={!canCreate}
						>
							{submitting ? "…" : "Create"}
						</button>
					</div>
				</div>
			)}
		</dialog>
	);
}
