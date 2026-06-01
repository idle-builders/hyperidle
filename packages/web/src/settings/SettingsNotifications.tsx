/**
 * SettingsNotifications — Notifications settings section.
 *
 * P4 Task 10: Settings section (AC-12, AC-17)
 * Manages notification preferences via PATCH /api/settings.
 *
 * Interactive toggles for review/cost/blocker alerts, quiet hours inputs
 * (HH:MM 24h format), and per-product mute toggles.
 */

import { type JSX, useCallback, useState } from "react";
import { useSettings } from "../hooks/useSettings.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { NotificationSettings } from "./settings-types.js";

const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValid24hTime(value: string): boolean {
	return TIME_24H_RE.test(value);
}

export function SettingsNotifications(): JSX.Element {
	const { settings, status } = useSettings();
	const { showToast } = useToast();
	const [saving, setSaving] = useState(false);
	const [validationErrors, setValidationErrors] = useState<string[]>([]);

	// Local draft state — initialized from loaded settings
	const [draft, setDraft] = useState<NotificationSettings | null>(null);

	// Sync draft from loaded settings (first load only, don't overwrite user edits)
	const currentNotifications = settings?.notifications ?? null;
	if (draft === null && currentNotifications !== null) {
		setDraft(currentNotifications);
	}

	const updateField = useCallback(
		(field: keyof NotificationSettings, value: boolean | string | string[]): void => {
			setDraft((prev) => (prev === null ? prev : { ...prev, [field]: value }));
		},
		[],
	);

	const handleSave = useCallback(async (): Promise<void> => {
		if (!draft) return;
		const errors: string[] = [];
		// Only validate time format when quiet hours are enabled — start/end are
		// irrelevant when quietHoursEnabled=false so we skip the format check.
		if (draft.quietHoursEnabled) {
			if (!isValid24hTime(draft.quietHoursStart)) {
				errors.push("Invalid time format for quiet hours start (use HH:MM)");
			}
			if (!isValid24hTime(draft.quietHoursEnd)) {
				errors.push("Invalid time format for quiet hours end (use HH:MM)");
			}
		}
		if (errors.length > 0) {
			setValidationErrors(errors);
			return;
		}
		setValidationErrors([]);
		setSaving(true);
		try {
			const res = await apiFetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ notifications: draft }),
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			showToast("Notifications saved");
		} catch {
			showToast("Failed to save notifications");
		} finally {
			setSaving(false);
		}
	}, [draft, showToast]);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !settings || !draft) {
		return (
			<p className="text-sm text-error">Failed to load notification settings. Please try again.</p>
		);
	}

	// @lore U1: `teams` replaces `products`.
	const teams = settings.teams;

	return (
		<div className="flex flex-col gap-3">
			{/* Alert toggles */}
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Review alerts</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={draft.reviewAlerts}
					onChange={(e) => updateField("reviewAlerts", e.target.checked)}
					aria-label="Toggle review alerts"
				/>
			</div>
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Cost alerts</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={draft.costAlerts}
					onChange={(e) => updateField("costAlerts", e.target.checked)}
					aria-label="Toggle cost alerts"
				/>
			</div>
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Blocker alerts</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={draft.blockerAlerts}
					onChange={(e) => updateField("blockerAlerts", e.target.checked)}
					aria-label="Toggle blocker alerts"
				/>
			</div>

			{/* Quiet hours */}
			<div className="divider text-xs text-[var(--text-tertiary)]">Quiet Hours</div>
			<div className="flex items-center justify-between py-1">
				<span className="text-sm">Enable quiet hours</span>
				<input
					type="checkbox"
					className="toggle toggle-sm toggle-primary"
					checked={draft.quietHoursEnabled}
					onChange={(e) => updateField("quietHoursEnabled", e.target.checked)}
					aria-label="Enable quiet hours"
				/>
			</div>
			<div className="flex gap-3">
				<div className="form-control flex-1">
					<label className="label" htmlFor="quiet-start">
						<span
							className={`label-text ${draft.quietHoursEnabled ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}
						>
							Start
						</span>
					</label>
					<input
						id="quiet-start"
						type="text"
						className="input input-sm input-bordered"
						placeholder="22:00"
						value={draft.quietHoursStart}
						onChange={(e) => updateField("quietHoursStart", e.target.value)}
						aria-label="Quiet hours start"
						disabled={!draft.quietHoursEnabled}
					/>
				</div>
				<div className="form-control flex-1">
					<label className="label" htmlFor="quiet-end">
						<span
							className={`label-text ${draft.quietHoursEnabled ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}
						>
							End
						</span>
					</label>
					<input
						id="quiet-end"
						type="text"
						className="input input-sm input-bordered"
						placeholder="08:00"
						value={draft.quietHoursEnd}
						onChange={(e) => updateField("quietHoursEnd", e.target.value)}
						aria-label="Quiet hours end"
						disabled={!draft.quietHoursEnabled}
					/>
				</div>
			</div>

			{/* Team mutes — @lore U1: formerly "Product mutes" */}
			{teams.length > 0 && (
				<>
					<div className="divider text-xs text-[var(--text-tertiary)]">Mute by Team</div>
					{teams.map((t) => (
						<div key={t.id} className="flex items-center justify-between py-1">
							<span className="text-sm">{t.name}</span>
							<input
								type="checkbox"
								className="toggle toggle-sm"
								checked={draft.mutedTeams.includes(t.id)}
								onChange={(e) => {
									const next = e.target.checked
										? [...draft.mutedTeams, t.id]
										: draft.mutedTeams.filter((id) => id !== t.id);
									// @lore U1: `mutedTeams` replaces `mutedProducts`.
									updateField("mutedTeams", next);
								}}
								aria-label={`Mute ${t.name}`}
							/>
						</div>
					))}
				</>
			)}

			{/* Validation errors */}
			{validationErrors.map((err) => (
				<p key={err} className="text-sm text-error">
					{err}
				</p>
			))}

			<div className="flex justify-end mt-2">
				<button
					type="button"
					className="btn btn-primary btn-sm"
					disabled={saving}
					onClick={handleSave}
				>
					{saving && <span className="loading loading-spinner loading-xs" />}
					Save Notifications
				</button>
			</div>
		</div>
	);
}
