/**
 * SettingsProfile — Profile settings section.
 *
 * Pre-fills name + email from current user. Saves via `edit_user`.
 * Shows toast feedback on save success or failure.
 *
 * AC-13: Profile section: name + email edits persist via edit_user
 * AC-24: Settings save feedback via toast
 * AC-25: Profile edits do NOT silently revert (dirty tracking)
 *
 * @lore BC5 T9: the door swap — `call("edit_user", { id, name, email })`
 * replaces `apiFetch(PATCH /api/users/:id)` (architecture.md §8).
 */

import { type ChangeEvent, type JSX, useCallback, useEffect, useState } from "react";
import { Button, ErrorState, Input, SkeletonList } from "../ds";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";

/**
 * AV2: backend-aware email hint.
 * local / no-bridge → "Used for notifications." (no login)
 * shared / web → "Used for notifications and login."
 *
 * @lore AV2: The email hint text is only relevant as a login identifier in
 * shared/web mode (where the backend authenticates users by email). In local
 * mode (single-user Electron), email is for notifications only — there is no
 * login gate to explain.
 */
function resolveEmailHint(): string {
	if (typeof window === "undefined" || window.__HYPERIDLE__ === undefined) {
		// Web mode (no bridge) — email is used for login
		return "Used for notifications and login.";
	}
	if (window.__HYPERIDLE__.backendMode === "shared") {
		return "Used for notifications and login.";
	}
	// local mode — no login
	return "Used for notifications.";
}

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
			const result = await call("edit_user", { id: user.id, name, email });
			if (!result.ok) {
				showToast("Failed to save profile");
				return;
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

			<Input
				id="profile-email"
				label="Email"
				type="email"
				value={email}
				onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
				hint={resolveEmailHint()}
				aria-label="Email"
			/>

			<div>
				<Button size="sm" type="button" disabled={!isDirty || saving} onClick={handleSave}>
					{saving ? "Saving…" : "Save profile"}
				</Button>
			</div>
		</div>
	);
}
