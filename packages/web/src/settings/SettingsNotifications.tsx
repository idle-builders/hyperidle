/**
 * SettingsNotifications — Notifications settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12, AC-17)
 * Manages notification preferences via PATCH /api/settings.
 */

import { type JSX, useCallback, useState } from "react";
import { useSettings } from "../hooks/useSettings.js";
import { useToast } from "../shell/ToastRegion.js";

export function SettingsNotifications(): JSX.Element {
	const { settings, status, save } = useSettings();
	const { showToast } = useToast();
	const [saving, setSaving] = useState(false);

	const handleSave = useCallback(async (): Promise<void> => {
		if (!settings) return;
		setSaving(true);
		try {
			await save(settings);
			showToast("Notifications saved");
		} catch {
			showToast("Failed to save notifications");
		} finally {
			setSaving(false);
		}
	}, [settings, save, showToast]);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !settings) {
		return (
			<p className="text-sm text-error">Failed to load notification settings. Please try again.</p>
		);
	}

	const { notifications } = settings;

	return (
		<div className="flex flex-col gap-3">
			<div className="form-control">
				<label className="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						className="checkbox checkbox-sm"
						checked={notifications.reviewAlerts}
						readOnly
						aria-label="Review alerts"
					/>
					<span className="label-text text-[var(--text-mid)]">Review alerts</span>
				</label>
			</div>

			<div className="form-control">
				<label className="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						className="checkbox checkbox-sm"
						checked={notifications.costAlerts}
						readOnly
						aria-label="Cost alerts"
					/>
					<span className="label-text text-[var(--text-mid)]">Cost alerts</span>
				</label>
			</div>

			<div className="form-control">
				<label className="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						className="checkbox checkbox-sm"
						checked={notifications.blockerAlerts}
						readOnly
						aria-label="Blocker alerts"
					/>
					<span className="label-text text-[var(--text-mid)]">Blocker alerts</span>
				</label>
			</div>

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
