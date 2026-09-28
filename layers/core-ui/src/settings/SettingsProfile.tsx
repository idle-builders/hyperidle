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

	useEffect(() => {
		if (user) {
			setName(user.name);
			setSavedName(user.name);
		}
	}, [user]);

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
