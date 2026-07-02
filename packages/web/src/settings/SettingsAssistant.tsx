/**
 * AD8b Task 10 — SettingsAssistant component.
 *
 * AC-2: The user can view and edit their assistant's system prompt in settings.
 *
 * AR4c: Extended with harness+model selects (same pattern as SettingsAgents AH2).
 * - Harness Select: populated from GET /api/harnesses (registry-driven)
 * - Model Select: populated from MODEL_CATALOG
 * - Save sends harnessType + modelId + modelProvider in the PATCH body
 * - Changing any field (harness, model, or persona) marks the form dirty
 * - Incompatible triple → inline error (422 from the route)
 */

// hearth-internal-padding
import { Button, Input, Select } from "@hyperidle/design-system";
import { MODEL_CATALOG } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";

interface AssistantData {
	id: string;
	name: string;
	systemPrompt: string | null;
	harnessType: string | null;
	modelId: string | null;
	modelProvider: string | null;
}

interface HarnessEntry {
	type: string;
	name: string;
	modelProviders: string[];
}

interface SettingsAssistantProps {
	/** The human user's id. Defaults to the authenticated user if omitted. */
	userId: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Assistant config editor: harness select, model select, persona textarea.
 *
 * @lore AR4c: The harness+model selects follow SettingsAgents AH2 exactly —
 * same option-building pattern, same empty-string-means-default semantics.
 * modelProvider is derived from the harness's first supported provider when the
 * harness changes; the PATCH body carries it so the route validator
 * (validateAgentConfig) can check INCOMPATIBLE_HARNESS_MODEL.
 */
export function SettingsAssistant({ userId }: SettingsAssistantProps): JSX.Element {
	const [loading, setLoading] = useState(true);
	const [systemPrompt, setSystemPrompt] = useState("");
	const [savedPrompt, setSavedPrompt] = useState("");
	const [harnessType, setHarnessType] = useState("");
	const [savedHarness, setSavedHarness] = useState("");
	const [modelId, setModelId] = useState("");
	const [savedModelId, setSavedModelId] = useState("");
	const [modelProvider, setModelProvider] = useState("");
	const [savedModelProvider, setSavedModelProvider] = useState("");
	const [harnesses, setHarnesses] = useState<HarnessEntry[]>([]);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Load the assistant data and harness list on mount
	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		Promise.all([
			apiFetch(`/api/users/${userId}/assistant`, {
				method: "GET",
				headers: { "X-Identity": userId },
			}),
			apiFetch("/api/harnesses"),
		])
			.then(async ([assistantRes, harnessesRes]) => {
				if (cancelled) return;
				if (!assistantRes.ok) {
					setErrorMessage("Failed to load assistant.");
					setLoading(false);
					return;
				}
				const data = (await assistantRes.json()) as AssistantData;
				if (!cancelled) {
					const prompt = data.systemPrompt ?? "";
					setSystemPrompt(prompt);
					setSavedPrompt(prompt);
					const h = data.harnessType ?? "";
					setHarnessType(h);
					setSavedHarness(h);
					const m = data.modelId ?? "";
					setModelId(m);
					setSavedModelId(m);
					const mp = data.modelProvider ?? "";
					setModelProvider(mp);
					setSavedModelProvider(mp);
				}
				if (harnessesRes.ok) {
					const harnessesJson = (await harnessesRes.json()) as HarnessEntry[];
					if (!cancelled && Array.isArray(harnessesJson)) {
						setHarnesses(harnessesJson);
					}
				}
				if (!cancelled) setLoading(false);
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

	const isDirty =
		systemPrompt !== savedPrompt ||
		harnessType !== savedHarness ||
		modelId !== savedModelId ||
		modelProvider !== savedModelProvider;

	// AH2: Harness Select options — empty string = "default (builtin)"
	const harnessOptions = [
		{ value: "", label: "Default" },
		...harnesses.map((h) => ({ value: h.type, label: h.name })),
	];

	// AH2: Model Select options from MODEL_CATALOG — empty string = "system default"
	const modelOptions = [
		{ value: "", label: "System default" },
		...MODEL_CATALOG.map((m) => ({ value: m.id, label: m.label })),
	];

	const handleHarnessChange = useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			const newHarness = e.target.value;
			setHarnessType(newHarness);
			// Derive modelProvider from the harness's first supported provider.
			// Empty harness = default = clear to empty provider.
			if (newHarness === "") {
				setModelProvider("");
			} else {
				const harnessEntry = harnesses.find((h) => h.type === newHarness);
				if (harnessEntry && harnessEntry.modelProviders.length > 0) {
					const firstProvider = harnessEntry.modelProviders[0];
					if (firstProvider !== undefined) setModelProvider(firstProvider);
				}
			}
			if (saveState === "saved" || saveState === "error") setSaveState("idle");
			setErrorMessage(null);
		},
		[harnesses, saveState],
	);

	const handleModelChange = useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			setModelId(e.target.value);
			if (saveState === "saved" || saveState === "error") setSaveState("idle");
			setErrorMessage(null);
		},
		[saveState],
	);

	const handleSave = useCallback(async () => {
		setSaveState("saving");
		setErrorMessage(null);

		try {
			const body: {
				systemPrompt?: string;
				harnessType?: string | null;
				modelId?: string | null;
				modelProvider?: string | null;
			} = {};

			// Always include systemPrompt in the PATCH (it's the primary field)
			body.systemPrompt = systemPrompt;

			// Include harness/model fields: empty string → null (clear to default)
			body.harnessType = harnessType === "" ? null : harnessType;
			body.modelId = modelId === "" ? null : modelId;
			body.modelProvider = modelProvider === "" ? null : modelProvider;

			const res = await apiFetch(`/api/users/${userId}/assistant`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"X-Identity": userId,
				},
				body: JSON.stringify(body),
			});

			if (!res.ok) {
				let errMsg = "Could not save assistant config. Please try again.";
				try {
					const errBody = (await res.json()) as { error?: string };
					if (errBody.error) errMsg = errBody.error;
				} catch {
					// ignore parse error
				}
				setSaveState("error");
				setErrorMessage(errMsg);
				return;
			}

			const data = (await res.json()) as AssistantData;
			const saved = data.systemPrompt ?? "";
			setSavedPrompt(saved);
			setSystemPrompt(saved);
			const savedH = data.harnessType ?? "";
			setSavedHarness(savedH);
			setHarnessType(savedH);
			const savedM = data.modelId ?? "";
			setSavedModelId(savedM);
			setModelId(savedM);
			const savedMp = data.modelProvider ?? "";
			setSavedModelProvider(savedMp);
			setModelProvider(savedMp);
			setSaveState("saved");

			// Reset to idle after 2 seconds
			setTimeout(() => setSaveState("idle"), 2000);
		} catch {
			setSaveState("error");
			setErrorMessage("Could not save assistant config. Please try again.");
		}
	}, [userId, systemPrompt, harnessType, modelId, modelProvider]);

	const isSaving = saveState === "saving";
	const saveButtonLabel = isSaving ? "Saving..." : saveState === "saved" ? "Saved" : "Save";

	return (
		<div className="flex flex-col gap-[18px]">
			<p className="text-[13px] text-[var(--text-secondary)]">
				Configure your personal assistant — the agent that chats with you. It runs through your
				connected harness like any other agent.
			</p>

			{/* AR4c: Harness + Model select row (SettingsAgents AH2 pattern) */}
			<div className="flex gap-[9px] flex-wrap">
				<div className="flex-1 min-w-[140px]">
					<Select
						id="assistant-harness"
						label="Harness"
						size="sm"
						className="max-md:text-[16px]"
						value={loading ? "" : harnessType}
						onChange={handleHarnessChange}
						aria-label="Harness"
						options={harnessOptions}
						disabled={loading || isSaving}
					/>
				</div>
				<div className="flex-1 min-w-[140px]">
					<Select
						id="assistant-model"
						label="Model"
						size="sm"
						className="max-md:text-[16px]"
						value={loading ? "" : modelId}
						onChange={handleModelChange}
						aria-label="Model"
						options={modelOptions}
						disabled={loading || isSaving}
					/>
				</div>
			</div>

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
				<p className="text-[13px] text-[var(--status-success)]">Saved</p>
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
