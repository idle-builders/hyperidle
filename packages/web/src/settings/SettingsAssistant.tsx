/**
 * AD8b Task 10 — SettingsAssistant component.
 *
 * AC-2: The user can view and edit their assistant's system prompt in settings.
 *
 * - Loads the system prompt via GET /api/users/:userId/assistant
 * - Saves via PATCH /api/users/:userId/assistant
 * - Save button disabled when clean; enabled when dirty
 * - Shows "Saving..." while in flight; "Saved" briefly after success
 * - Shows inline error on failure
 */

// hearth-internal-padding
import { Button, Input } from "@hyperidle/design-system";
import { type JSX, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

interface AssistantData {
	id: string;
	name: string;
	systemPrompt: string | null;
}

interface SettingsAssistantProps {
	/** The human user's id. Defaults to the authenticated user if omitted. */
	userId: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * System prompt editor for the user's personal assistant agent.
 */
export function SettingsAssistant({ userId }: SettingsAssistantProps): JSX.Element {
	const [loading, setLoading] = useState(true);
	const [systemPrompt, setSystemPrompt] = useState("");
	const [savedPrompt, setSavedPrompt] = useState("");
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Load the assistant data on mount
	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		apiFetch(`/api/users/${userId}/assistant`, {
			method: "GET",
			headers: { "X-Identity": userId },
		})
			.then(async (res) => {
				if (cancelled) return;
				if (!res.ok) {
					setErrorMessage("Failed to load assistant.");
					setLoading(false);
					return;
				}
				const data = (await res.json()) as AssistantData;
				if (!cancelled) {
					const prompt = data.systemPrompt ?? "";
					setSystemPrompt(prompt);
					setSavedPrompt(prompt);
					setLoading(false);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setErrorMessage("Failed to load assistant.");
					setLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [userId]);

	const isDirty = systemPrompt !== savedPrompt;

	const handleSave = useCallback(async () => {
		setSaveState("saving");
		setErrorMessage(null);

		try {
			const res = await apiFetch(`/api/users/${userId}/assistant`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"X-Identity": userId,
				},
				body: JSON.stringify({ systemPrompt }),
			});

			if (!res.ok) {
				setSaveState("error");
				setErrorMessage("Could not save system prompt. Please try again.");
				return;
			}

			const data = (await res.json()) as AssistantData;
			const saved = data.systemPrompt ?? "";
			setSavedPrompt(saved);
			setSystemPrompt(saved);
			setSaveState("saved");

			// Reset to idle after 2 seconds
			setTimeout(() => setSaveState("idle"), 2000);
		} catch {
			setSaveState("error");
			setErrorMessage("Could not save system prompt. Please try again.");
		}
	}, [userId, systemPrompt]);

	const isSaving = saveState === "saving";
	const saveButtonLabel = isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save";

	return (
		<div className="flex flex-col gap-[18px]">
			<p className="text-[13px] text-[var(--text-secondary)]">
				The system prompt shapes how your personal assistant responds to you. Edit it to give your
				assistant a custom persona or set of instructions.
			</p>

			<div className="flex flex-col gap-[12px]">
				{/* AH3 D4: Migrated to design-system Input textarea. Prose font (not mono)
				    per design approved.md W2. The Input component uses --r-default radius
				    and design token colors — no inline style patches needed. */}
				<Input
					id="system-prompt"
					label="Persona instructions"
					textarea
					value={loading ? "" : systemPrompt}
					onChange={(e) => {
						setSystemPrompt(e.target.value);
						if (saveState === "saved" || saveState === "error") setSaveState("idle");
					}}
					disabled={loading || isSaving}
					placeholder={
						loading ? "Loading system prompt..." : "Describe how your assistant should behave..."
					}
					rows={10}
				/>
			</div>

			{errorMessage && (
				<p className="text-[12px] text-[var(--status-error)]" role="alert">
					{errorMessage}
				</p>
			)}

			{saveState === "saved" && !errorMessage && (
				<p className="text-[13px] text-[var(--status-success)]">
					Saved
				</p>
			)}

			<div className="flex items-center gap-[12px]">
				{/* AH3: Use design-system Button */}
				<Button
					onClick={handleSave}
					disabled={!isDirty || isSaving || loading}
					aria-label={saveButtonLabel}
				>
					{saveButtonLabel}
				</Button>
			</div>
		</div>
	);
}
