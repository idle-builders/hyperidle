/**
 * SettingsProfile — Profile settings section.
 *
 * Pre-fills name + email from current user. Saves via PATCH /api/users/:id.
 * Shows toast feedback on save success or failure.
 *
 * AC-13: Profile section: name + email edits persist via PATCH /api/users/:id
 * AC-24: Settings save feedback via toast
 * AC-25: Profile edits do NOT silently revert (dirty tracking)
 */

import { type JSX, useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

export function SettingsProfile(): JSX.Element {
	const { user, status } = useCurrentUser();
	const { showToast } = useToast();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [savedName, setSavedName] = useState("");
	const [savedEmail, setSavedEmail] = useState("");
	const [saving, setSaving] = useState(false);

	// Pre-fill from current user when loaded
	useEffect(() => {
		if (user) {
			setName(user.name);
			setEmail(user.email);
			setSavedName(user.name);
			setSavedEmail(user.email);
		}
	}, [user]);

	// AC-25: Dirty tracking — Save enabled only when values differ from saved
	const isDirty = name !== savedName || email !== savedEmail;

	const handleSave = useCallback(async (): Promise<void> => {
		if (!(user && isDirty)) return;
		setSaving(true);
		try {
			const res = await apiFetch(`/api/users/${user.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email }),
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			// Update saved values so Save button becomes disabled again
			setSavedName(name);
			setSavedEmail(email);
			showToast("Profile saved");
		} catch {
			showToast("Failed to save profile");
		} finally {
			setSaving(false);
		}
	}, [user, isDirty, name, email, showToast]);

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error" || !user) {
		return <p className="text-sm text-error">Failed to load profile. Please try again.</p>;
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="form-control">
				<label className="label" htmlFor="profile-name">
					<span className="label-text text-[var(--text-secondary)]">Name</span>
				</label>
				<input
					id="profile-name"
					type="text"
					className="input input-sm input-bordered w-full text-[var(--text-primary)]"
					value={name}
					onChange={(e) => setName(e.target.value)}
					aria-label="Name"
				/>
			</div>

			<div className="form-control">
				<label className="label" htmlFor="profile-email">
					<span className="label-text text-[var(--text-secondary)]">Email</span>
				</label>
				<input
					id="profile-email"
					type="email"
					className="input input-sm input-bordered w-full text-[var(--text-primary)]"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					aria-label="Email"
				/>
			</div>

			<div className="flex justify-end mt-2">
				<button
					type="button"
					className="btn btn-primary btn-sm"
					disabled={!isDirty || saving}
					onClick={handleSave}
				>
					{saving && <span className="loading loading-spinner loading-xs" />}
					Save Profile
				</button>
			</div>
		</div>
	);
}
