/**
 * AV4 — RoutineDetailPane: de-greyed routine detail body.
 *
 * Used in two mounts:
 *  1. WorkTeam split-pane destination (origin = team list).
 *  2. WorkRoutine page scaffold (standalone deep-link).
 *
 * Editable fields via PATCH /api/routines/:id:
 *  - name (input)
 *  - description / "Prompt" (textarea)
 *  - autonomyLevel (Select)
 *  - schedule / triggerConfig (SCHEDULE_PRESETS Select + custom cron input)
 *  - silent (checkbox toggle)
 *
 * De-grey: Configuration/LastRunSummary sections render on page surface via
 * Row/KeyValue/ItemList flush — no bg-[var(--surface-container)] wrappers.
 *
 * @lore AV4: The "prompt" IS routine.description — ground truth from
 * fabric/src/session-context.ts buildRoutineSessionContextData. No new column needed.
 *
 * @lore AV4: overrideData prop follows the WorkRoutine/WorkTeam established pattern
 * for injecting fixture data in stories and tests without a real fetch.
 *
 * @lore AV4: RoutineInfo.silent was added to the shared type so we can initialize
 * the toggle from the fetched value. Server defaults it to false for pre-AV4 routines.
 *
 * @lore AU21 Increment 14a: the Budget section (editable costCapPerRunMinor/
 * costCapMonthlyMinor, avg-cost/cost-this-month display, budget-utilization
 * progress bars) is HARD-DELETED along with the rest of the cost-cap feature
 * — no replacement. `budget_exhausted`/`monthly_budget_exhausted` run
 * outcomes and the per-run `cost` column are deleted with it.
 */

// hearth-internal-padding
import {
	Button,
	EmptyState,
	ErrorState,
	Input,
	ItemList,
	KeyValue,
	PageScaffold,
	Row,
	RowDot,
	routineStateToStatus,
	SectionLabel,
	Select,
	SkeletonCard,
	StatusChip,
} from "@hyperidle/design-system";
import type { RoutineDetail, RoutineRunSummary } from "@hyperidle/domain-model";
import { SCHEDULE_PRESETS } from "@hyperidle/domain-model";
import { absoluteDate, absoluteDateTime } from "@hyperidle/presentation-format";
import { type JSX, useCallback, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRoutine } from "../../hooks/useRoutine.js";
import { apiFetch } from "../../services/api-fetch.js";
import { ToastContext } from "../../shell/ToastRegion.js";

export interface RoutineDetailPaneProps {
	routineId: string;
	onClose?: () => void;
	/** Override routine data — used by stories and tests (no fetch). */
	overrideData?: RoutineDetail | null;
}

const AUTONOMY_LABELS: Record<number, string> = {
	1: "L1 — Every run reviewed",
	2: "L2 — Human reviews",
	3: "L3 — Autonomous, human on error",
	4: "L4 — Fully autonomous",
};

/** Map run outcome to RowDot tone. */
function outcomeTone(
	outcome: RoutineRunSummary["outcome"],
): "success" | "error" | "warning" | "neutral" {
	if (outcome === "success") return "success";
	if (outcome === "error" || outcome === "timeout") return "error";
	return "neutral";
}

export function RoutineDetailPane({
	routineId,
	onClose,
	overrideData,
}: RoutineDetailPaneProps): JSX.Element {
	const fetched = useRoutine(overrideData !== undefined ? undefined : routineId);
	const data = overrideData !== undefined ? overrideData : fetched.data;
	const loading = overrideData === undefined && fetched.loading;
	const error = overrideData === undefined ? fetched.error : null;
	const refetch = fetched.refetch;

	if (loading) {
		return (
			<div className="flex flex-col gap-[12px] p-[24px]" data-testid="routine-detail-pane-loading">
				<SkeletonCard ariaLabel="Loading routine detail" />
				<SkeletonCard ariaLabel="Loading run history" />
			</div>
		);
	}

	if (error !== null) {
		return (
			<div className="p-[24px]" data-testid="routine-detail-pane-error">
				<ErrorState title="Failed to load routine" description={error.message} />
			</div>
		);
	}

	if (data === null || data === undefined) {
		return (
			<div className="p-[24px]" data-testid="routine-detail-pane-empty">
				<EmptyState title="Routine not found" description="This routine could not be loaded." />
			</div>
		);
	}

	return (
		<RoutineDetailPaneLoaded
			detail={data}
			routineId={routineId}
			onClose={onClose}
			refetch={refetch}
		/>
	);
}

interface RoutineDetailPaneLoadedProps {
	detail: RoutineDetail;
	routineId: string;
	onClose?: () => void;
	refetch: () => void;
}

function RoutineDetailPaneLoaded({
	detail,
	routineId,
	onClose,
	refetch,
}: RoutineDetailPaneLoadedProps): JSX.Element {
	const { routine, runs } = detail;
	const navigate = useNavigate();
	// @lore AV4: read ToastContext directly (not useToast) so the pane renders
	// in unit tests / Storybook without a <ToastRegion> ancestor, following the
	// L9 pattern established in Conversations.tsx. Production always has the
	// provider via AppShell. When absent, toasts fall back silently.
	const toast = useContext(ToastContext);
	const showToast = toast?.showToast ?? ((_msg: string) => undefined);

	// Derive initial schedule state from triggerConfig
	// @lore AV4: if the stored cron matches a preset, show that preset; else show "custom"
	// with the stored cron pre-populated.
	const storedCron: string = (() => {
		try {
			const cfg = JSON.parse(routine.triggerConfig ?? "{}") as { cron?: string };
			return cfg.cron ?? "";
		} catch {
			return "";
		}
	})();
	const isStoredCronPreset = SCHEDULE_PRESETS.some((p) => p.cron === storedCron);
	const initialScheduleValue =
		storedCron && !isStoredCronPreset ? "custom" : storedCron || SCHEDULE_PRESETS[0].cron;
	const initialCustomCron = storedCron && !isStoredCronPreset ? storedCron : "";

	// Editable form state
	const [name, setName] = useState(routine.name);
	const [description, setDescription] = useState(routine.description ?? "");
	const [autonomyLevel, setAutonomyLevel] = useState(String(routine.autonomyLevel ?? ""));
	// Schedule picker — "custom" is the sentinel value
	const [scheduleValue, setScheduleValue] = useState<string>(initialScheduleValue);
	const [customCron, setCustomCron] = useState<string>(initialCustomCron);
	// Silent toggle
	const [silent, setSilent] = useState<boolean>(routine.silent ?? false);
	const [saving, setSaving] = useState(false);

	// Action state
	const [currentState, setCurrentState] = useState(routine.state);
	const [actionPending, setActionPending] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	const autonomyLabel =
		routine.autonomyLevel != null
			? (AUTONOMY_LABELS[routine.autonomyLevel] ?? `L${routine.autonomyLevel}`)
			: "—";

	const lastRunLabel =
		routine.lastRunAt != null
			? `${absoluteDateTime(routine.lastRunAt)}${routine.lastRunOutcome ? ` — ${routine.lastRunOutcome}` : ""}`
			: "Never";

	const isCustomSchedule = scheduleValue === "custom";
	const resolvedCron = isCustomSchedule ? customCron.trim() : scheduleValue;

	const handleSave = useCallback(async (): Promise<void> => {
		setSaving(true);
		try {
			const body: Record<string, unknown> = {
				name,
				description: description || null,
				silent,
			};
			if (autonomyLevel) {
				body.autonomyLevel = Number(autonomyLevel);
			}
			// Schedule: only include if we have a resolved cron
			if (resolvedCron) {
				body.triggerConfig = JSON.stringify({ cron: resolvedCron });
			}

			const res = await apiFetch(`/api/routines/${encodeURIComponent(routineId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			showToast("Routine saved");
			refetch();
		} catch {
			showToast("Failed to save routine");
		} finally {
			setSaving(false);
		}
	}, [name, description, autonomyLevel, resolvedCron, silent, routineId, refetch, showToast]);

	async function handleTogglePause(): Promise<void> {
		if (actionPending) return;
		const newState = currentState === "active" ? "paused" : "active";
		setActionPending(true);
		try {
			const res = await apiFetch(`/api/routines/${encodeURIComponent(routineId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ state: newState }),
			});
			if (res.ok) setCurrentState(newState);
		} finally {
			setActionPending(false);
		}
	}

	async function handleTriggerNow(): Promise<void> {
		if (actionPending) return;
		setActionPending(true);
		try {
			await apiFetch(`/api/routines/${encodeURIComponent(routineId)}/trigger`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
		} finally {
			setActionPending(false);
		}
	}

	async function handleDeleteConfirm(): Promise<void> {
		if (actionPending) return;
		setActionPending(true);
		try {
			const res = await apiFetch(`/api/routines/${encodeURIComponent(routineId)}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
			});
			if (res.ok) navigate("/work");
		} finally {
			setActionPending(false);
			setShowDeleteConfirm(false);
		}
	}

	return (
		<PageScaffold
			data-testid="routine-detail-pane"
			header={
				/* Pane header with name + save/cancel + status */
				<div className="flex items-center gap-[12px] px-[24px] py-[18px] border-b border-[var(--border-subtle)] shrink-0">
					<div className="flex-1 flex items-center gap-[9px]">
						<span className="text-[17px] font-semibold text-[var(--text-primary)] leading-tight truncate">
							{routine.name}
						</span>
						<StatusChip status={routineStateToStatus(currentState)} />
					</div>
					<div className="flex items-center gap-[6px] shrink-0">
						{onClose && (
							<Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={saving}>
								Cancel
							</Button>
						)}
						<Button
							variant="primary"
							size="sm"
							type="button"
							onClick={handleSave}
							disabled={saving || actionPending}
						>
							{saving && <span className="loading loading-spinner loading-xs" />}
							Save
						</Button>
					</div>
				</div>
			}
		>
			<div className="flex flex-col gap-[12px] p-[24px]">
				{/* Editable fields — on page surface (no grey card) */}
				<section aria-label="Routine configuration">
					<SectionLabel label="Configuration" as="h2" />

					{/* Editable name */}
					<div className="flex flex-col gap-[6px] mb-[9px]">
						<label
							className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]"
							htmlFor="routine-name-input"
						>
							Name
						</label>
						<Input
							id="routine-name-input"
							aria-label="Name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							disabled={saving}
						/>
					</div>

					{/* Editable prompt (= description) */}
					<div className="flex flex-col gap-[6px] mb-[9px]">
						<label
							className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]"
							htmlFor="routine-prompt-textarea"
						>
							Prompt
						</label>
						<p className="text-[12px] text-[var(--text-tertiary)]">
							The run instruction handed to the agent each time this routine fires.
						</p>
						<Input
							textarea
							id="routine-prompt-textarea"
							aria-label="Prompt"
							rows={6}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							disabled={saving}
							placeholder="Describe what this routine should do each run…"
						/>
					</div>

					{/* Autonomy level select */}
					<div className="flex flex-col gap-[6px] mb-[9px]">
						<label
							className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]"
							htmlFor="routine-autonomy-select"
						>
							Autonomy
						</label>
						<Select
							id="routine-autonomy-select"
							aria-label="Autonomy level"
							size="sm"
							value={autonomyLevel}
							onChange={(e) => setAutonomyLevel(e.target.value)}
							disabled={saving}
							options={[
								{ value: "", label: "Default" },
								{ value: "1", label: "L1 — Every run reviewed" },
								{ value: "2", label: "L2 — Human reviews" },
								{ value: "3", label: "L3 — Autonomous, human on error" },
								{ value: "4", label: "L4 — Fully autonomous" },
							]}
						/>
					</div>

					{/* Schedule picker */}
					<div className="flex flex-col gap-[6px] mb-[9px]">
						<label
							className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]"
							htmlFor="routine-schedule-select"
						>
							Schedule
						</label>
						<Select
							id="routine-schedule-select"
							aria-label="Schedule"
							size="sm"
							value={scheduleValue}
							onChange={(e) => setScheduleValue(e.target.value)}
							disabled={saving}
							options={[
								...SCHEDULE_PRESETS.map((p) => ({ value: p.cron, label: p.label })),
								{ value: "custom", label: "Custom…" },
							]}
						/>
					</div>

					{/* Custom cron input — only shown when "Custom…" is selected */}
					{isCustomSchedule && (
						<div className="flex flex-col gap-[6px] mb-[9px]">
							<label
								className="uppercase font-[family-name:var(--font-mono)] text-[11px] tracking-[var(--tracking-caps)] font-medium text-[var(--text-tertiary)]"
								htmlFor="routine-custom-cron-input"
							>
								Custom cron
							</label>
							<Input
								id="routine-custom-cron-input"
								aria-label="Custom cron expression"
								type="text"
								value={customCron}
								onChange={(e) => setCustomCron(e.target.value)}
								disabled={saving}
								placeholder="e.g. 30 6 * * 2"
							/>
						</div>
					)}

					{/* Silent toggle */}
					<div className="flex items-center gap-[9px] mb-[9px]">
						<input
							id="routine-silent-toggle"
							aria-label="Silent"
							type="checkbox"
							className="checkbox checkbox-sm"
							checked={silent}
							onChange={(e) => setSilent(e.target.checked)}
							disabled={saving}
						/>
						<label
							className="text-[12px] text-[var(--text-secondary)] cursor-pointer"
							htmlFor="routine-silent-toggle"
						>
							Silent — don't post on each run
						</label>
					</div>

					{/* Read-only metadata stack — on page surface, no grey card */}
					<div className="flex flex-col gap-[9px] mt-[12px]">
						<KeyValue label="Agent" value={routine.agentName} />
						<KeyValue label="Schedule" value={routine.scheduleLabel} />
						<KeyValue label="Trigger type" value={routine.triggerType} />
						<KeyValue label="Current autonomy" value={autonomyLabel} />
						<KeyValue
							label="Next run"
							value={routine.nextRunAt ? absoluteDateTime(routine.nextRunAt) : "On next event"}
						/>
						<KeyValue label="Last run" value={lastRunLabel} />
						{routine.createdAt && (
							<KeyValue
								label="Created"
								value={absoluteDate(routine.createdAt)}
								data-testid="routine-created"
							/>
						)}
					</div>

					{/* Action buttons */}
					{showDeleteConfirm ? (
						<div
							className="flex items-center gap-[9px] mt-[18px]"
							data-testid="routine-delete-inline"
						>
							<span className="text-xs text-[var(--text-secondary)] flex-1">
								Delete this routine? History will be preserved.
							</span>
							<Button
								variant="destructive"
								size="sm"
								onClick={() => void handleDeleteConfirm()}
								disabled={actionPending}
								data-testid="routine-delete-confirm"
							>
								Confirm delete
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setShowDeleteConfirm(false)}
								disabled={actionPending}
								data-testid="routine-delete-cancel"
							>
								Cancel
							</Button>
						</div>
					) : (
						<div className="flex gap-[9px] mt-[18px]" data-testid="routine-actions">
							<Button
								variant="ghost"
								size="sm"
								onClick={handleTogglePause}
								disabled={actionPending || saving}
								data-testid={currentState === "active" ? "routine-pause-btn" : "routine-resume-btn"}
							>
								{currentState === "active" ? "Pause" : "Resume"}
							</Button>
							<Button
								variant="primary"
								size="sm"
								onClick={handleTriggerNow}
								disabled={actionPending || saving}
								data-testid="routine-trigger-now-btn"
							>
								Trigger Now
							</Button>
							<div className="flex-1" />
							<Button
								variant="destructive"
								size="sm"
								onClick={() => setShowDeleteConfirm(true)}
								disabled={actionPending || saving}
								data-testid="routine-delete-btn"
							>
								Delete
							</Button>
						</div>
					)}
				</section>

				{/* Last run summary — on page surface, no grey card */}
				<section aria-label="Last run summary" data-testid="routine-last-run-summary">
					<SectionLabel label="Last Run Summary" as="h2" />
					{routine.lastRunSummary ? (
						<p className="text-xs text-[var(--text-secondary)]">{routine.lastRunSummary}</p>
					) : (
						<p className="text-xs text-[var(--text-tertiary)]">No previous runs</p>
					)}
				</section>

				{/* Run history — ItemList flush of Row primitives */}
				<section aria-label="Run history" data-testid="routine-run-history">
					<SectionLabel label="Recent Runs" as="h2" />
					<ItemList
						variant="flush"
						isEmpty={runs.length === 0}
						empty={{
							title: "No runs recorded yet.",
							description: "Runs will appear here after the routine fires.",
						}}
					>
						{runs.map((run) => (
							<Row
								key={run.id}
								data-testid="routine-run-row"
								lead={
									<RowDot tone={outcomeTone(run.outcome)} label={run.outcome} title={run.outcome} />
								}
								title={absoluteDateTime(run.startedAt)}
								cells={[
									{
										content: run.durationSeconds !== null ? `${run.durationSeconds}s` : "—",
										numeric: true,
										width: 60,
									},
								]}
							/>
						))}
					</ItemList>
				</section>
			</div>
		</PageScaffold>
	);
}
