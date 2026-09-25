/**
 * SettingsProfile — Profile settings section.
 *
 * Pre-fills the display name from the current user. Saves via `edit_user`.
 * Shows toast feedback on save success or failure. A profile carries no
 * email.
 *
 * AC-24: Settings save feedback via toast
 * AC-25: Profile edits do NOT silently revert (dirty tracking)
 */

import { type ChangeEvent, type JSX, useCallback, useEffect, useState } from "react";
import { Button, ErrorState, Input, SkeletonList } from "../ds";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";

export function SettingsProfile(): JSX.Element {
	const { user, status } = useCurrentUser();
	const { showToast } = useToast();

	const [name, setName] = useState("");
	const [savedName, setSavedName] = useState("");
	const [saving, setSaving] = useState(false);

	// Pre-fill from current user when loaded
	useEffect(() => {
		if (user) {
			setName(user.name);
			setSavedName(user.name);
		}
	}, [user]);

	// AC-25: Dirty tracking — Save enabled only when values differ from saved
	const isDirty = name !== savedName;

	const handleSave = useCallback(async (): Promise<void> => {
		if (!(user && isDirty)) return;
		setSaving(true);
		try {
			const result = await call("edit_user", { id: user.id, name });
			if (!result.ok) {
				showToast("Failed to save profile");
				return;
			}
			// Update saved values so Save button becomes disabled again
			setSavedName(name);
			showToast("Profile saved");
		} catch {
			showToast("Failed to save profile");
		} finally {
			setSaving(false);
		}
	}, [user, isDirty, name, showToast]);

	if (status === "loading") {
		return (
			<div className="max-w-[400px]">
				<SkeletonList rows={2} ariaLabel="Loading profile" />
			</div>
		);
	}

	if (status === "error" || !user) {
		return (
			<ErrorState
				compact
				title="Couldn't load profile"
				description="Failed to load your profile. Please try again."
			/>
		);
	}

	return (
		<div className="flex flex-col gap-[18px] max-w-[400px]">
			<Input
				id="profile-name"
				label="Display name"
				type="text"
				value={name}
				onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
				aria-label="Display name"
			/>

			<div>
				<Button size="sm" type="button" disabled={!isDirty || saving} onClick={handleSave}>
					{saving ? "Saving…" : "Save profile"}
				</Button>
			</div>
		</div>
	);
}
