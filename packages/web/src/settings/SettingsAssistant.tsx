/**
 * AD8b Task 10 — SettingsAssistant component.
 *
 * AC-2: The user can view and edit their assistant's soul prompt in settings.
 *
 * - Loads the soul prompt via GET /api/users/:userId/assistant
 * - Saves via PATCH /api/users/:userId/assistant
 * - Save button disabled when clean; enabled when dirty
 * - Shows "Saving..." while in flight; "Saved" briefly after success
 * - Shows inline error on failure
 */

// hearth-internal-padding
import { type JSX, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

interface AssistantData {
	id: string;
	name: string;
	soulPrompt: string | null;
}

interface SettingsAssistantProps {
	/** The human user's id. Defaults to the authenticated user if omitted. */
	userId: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Soul prompt editor for the user's personal assistant agent.
 */
export function SettingsAssistant({ userId }: SettingsAssistantProps): JSX.Element {
	const [loading, setLoading] = useState(true);
	const [soulPrompt, setSoulPrompt] = useState("");
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
					const prompt = data.soulPrompt ?? "";
					setSoulPrompt(prompt);
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

	const isDirty = soulPrompt !== savedPrompt;

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
				body: JSON.stringify({ soulPrompt }),
			});

			if (!res.ok) {
				setSaveState("error");
				setErrorMessage("Could not save soul prompt. Please try again.");
				return;
			}

			const data = (await res.json()) as AssistantData;
			const saved = data.soulPrompt ?? "";
			setSavedPrompt(saved);
			setSoulPrompt(saved);
			setSaveState("saved");

			// Reset to idle after 2 seconds
			setTimeout(() => setSaveState("idle"), 2000);
		} catch {
			setSaveState("error");
			setErrorMessage("Could not save soul prompt. Please try again.");
		}
	}, [userId, soulPrompt]);

	const isSaving = saveState === "saving";
	const saveButtonLabel = isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save";

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
					Assistant
				</h2>
				<p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
					The soul prompt shapes how your personal assistant responds to you. Edit it to give your
					assistant a custom persona or set of instructions.
				</p>
			</div>

			<div className="flex flex-col gap-3">
				<label
					htmlFor="soul-prompt"
					className="text-sm font-medium"
					style={{ color: "var(--text-primary)" }}
				>
					Persona instructions
				</label>
				<textarea
					id="soul-prompt"
					value={loading ? "" : soulPrompt}
					onChange={(e) => {
						setSoulPrompt(e.target.value);
						if (saveState === "saved" || saveState === "error") setSaveState("idle");
					}}
					disabled={loading || isSaving}
					placeholder={
						loading ? "Loading soul prompt..." : "Describe how your assistant should behave..."
					}
					rows={10}
					className="textarea textarea-bordered w-full font-mono text-sm resize-y"
					style={{
						color: "var(--text-primary)",
						backgroundColor: "var(--surface-container)",
						borderColor: "var(--border-subtle)",
						fontSize: "13px",
					}}
				/>
			</div>

			{errorMessage && (
				<p className="text-sm" style={{ color: "var(--status-error)" }} role="alert">
					{errorMessage}
				</p>
			)}

			{saveState === "saved" && !errorMessage && (
				<p className="text-sm" style={{ color: "var(--status-success)" }}>
					Saved
				</p>
			)}

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={handleSave}
					disabled={!isDirty || isSaving || loading}
					className="btn btn-primary btn-sm"
					aria-label={saveButtonLabel}
				>
					{saveButtonLabel}
				</button>
			</div>
		</div>
	);
}
