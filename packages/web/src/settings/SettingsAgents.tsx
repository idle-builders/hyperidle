/**
 * SettingsAgents — Agent Configuration settings section.
 *
 * X3 Task 6: Settings section (AC-9 through AC-12)
 * AH2: Harness is now a constrained Select from /api/harnesses (not free text).
 *      Model Select replaces Model Tier Select — options come from MODEL_CATALOG.
 *      422 errors render inline above Save/Cancel (not just a toast).
 *      StatusChip warning shown when agent's harnessType is not in registry.
 *
 * - Fetches agents from GET /api/agents (own fetch, no useSettings hook)
 * - Fetches registered harnesses from GET /api/harnesses on mount
 * - Table: Name | Role | Harness | Model | Sessions | Actions
 * - Inline edit row: expands below selected agent with form
 * - Add form: below table, role change fetches template to pre-fill soul prompt
 * - Delete: two-click confirmation with 3-second timeout to revert
 *
 * @lore X3: SettingsAgents follows the SettingsOrgChart pattern — fetch on
 * mount, table display, inline expand for editing. No useSettings hook —
 * uses its own GET /api/agents fetch because the settings response `users`
 * array does not include the X3 config fields (soulPrompt, harnessType, etc.).
 *
 * @lore AH2: Harness Select is populated from GET /api/harnesses (registry-driven).
 * Model Select is populated from MODEL_CATALOG (closed catalog). Free-text harness
 * input removed — unregistered harnesses are rejected by the API anyway.
 */

import { Select } from "@hyperidle/design-system";
import { AGENT_ROLE_CATALOG, MODEL_CATALOG } from "@hyperidle/shared";
// hearth-internal-padding
import { Fragment, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { AgentConfig } from "./settings-types.js";

// ---------------------------------------------------------------------------
// Harness registry type
// ---------------------------------------------------------------------------

interface HarnessEntry {
	type: string;
	name: string;
	modelProviders: string[];
}

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------

interface EditFormValues {
	name: string;
	role: string;
	soulPrompt: string;
	harnessType: string;
	modelId: string;
	maxConcurrentSessions: number;
}

function agentToEditValues(agent: AgentConfig): EditFormValues {
	return {
		name: agent.name,
		role: agent.role,
		soulPrompt: agent.soulPrompt ?? "",
		harnessType: agent.harnessType ?? "",
		modelId: agent.modelId ?? "",
		maxConcurrentSessions: agent.maxConcurrentSessions,
	};
}

// ---------------------------------------------------------------------------
// Helpers (outside component — no captured state, stable references)
// ---------------------------------------------------------------------------

/**
 * AH2: Parse a structured 422 error body to get the human-readable message.
 * Returns null for non-422 errors (those go to toast).
 *
 * @lore AH2: Defined outside SettingsAgents so useCallback deps stay clean.
 * A function defined inside the component body is re-created each render,
 * causing biome/react-hooks to flag it as a missing useCallback dependency.
 */
async function extract422Error(res: Response): Promise<string | null> {
	if (res.status !== 422) return null;
	try {
		const body = (await res.json()) as { error?: string; code?: string };
		return body.error ?? "Server rejected the changes.";
	} catch {
		return "Server rejected the changes.";
	}
}

// ---------------------------------------------------------------------------
// SettingsAgents
// ---------------------------------------------------------------------------

export function SettingsAgents(): JSX.Element {
	const { showToast } = useToast();
	const [agents, setAgents] = useState<AgentConfig[]>([]);
	const [harnesses, setHarnesses] = useState<HarnessEntry[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValues, setEditValues] = useState<EditFormValues | null>(null);
	const [editError, setEditError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [addMode, setAddMode] = useState(false);
	const [addValues, setAddValues] = useState<EditFormValues>({
		name: "",
		role: "builder",
		soulPrompt: "",
		harnessType: "",
		modelId: "",
		maxConcurrentSessions: 1,
	});
	const [addError, setAddError] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	// Two-click delete state
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const loadAgents = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const [agentsRes, harnessesRes] = await Promise.all([
				apiFetch("/api/agents"),
				apiFetch("/api/harnesses"),
			]);
			if (!agentsRes.ok) throw new Error(`HTTP ${agentsRes.status}`);
			const agentsJson = (await agentsRes.json()) as AgentConfig[];
			setAgents(agentsJson);
			if (harnessesRes.ok) {
				const harnessesJson = (await harnessesRes.json()) as HarnessEntry[];
				// AH2: Guard against non-array response (e.g. error body or test catch-all)
				if (Array.isArray(harnessesJson)) {
					setHarnesses(harnessesJson);
				}
			}
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void loadAgents();
	}, [loadAgents]);

	// Close edit form on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent): void => {
			if (e.key === "Escape") {
				setEditingId(null);
				setEditValues(null);
				setEditError(null);
				setAddMode(false);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	// AbortController ref for template fetches
	const templateFetchAbortRef = useRef<AbortController | null>(null);

	const fetchTemplate = useCallback(async (role: string): Promise<void> => {
		if (templateFetchAbortRef.current) {
			templateFetchAbortRef.current.abort();
		}
		const controller = new AbortController();
		templateFetchAbortRef.current = controller;
		try {
			const res = await apiFetch(`/api/agents/templates/${encodeURIComponent(role)}`, {
				signal: controller.signal,
			});
			if (!res.ok) return;
			const json = (await res.json()) as { role: string; content: string };
			setAddValues((prev) => ({ ...prev, soulPrompt: json.content }));
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
		} finally {
			if (templateFetchAbortRef.current === controller) {
				templateFetchAbortRef.current = null;
			}
		}
	}, []);

	const handleEditOpen = useCallback((agent: AgentConfig): void => {
		setEditingId(agent.id);
		setEditValues(agentToEditValues(agent));
		setEditError(null);
		setAddMode(false);
	}, []);

	const handleEditCancel = useCallback((): void => {
		setEditingId(null);
		setEditValues(null);
		setEditError(null);
	}, []);

	const handleEditSave = useCallback(async (): Promise<void> => {
		if (!(editingId && editValues)) return;
		setSaving(true);
		setEditError(null);
		try {
			const res = await apiFetch(`/api/agents/${encodeURIComponent(editingId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: editValues.name,
					role: editValues.role,
					soulPrompt: editValues.soulPrompt || null,
					harnessType: editValues.harnessType || null,
					modelId: editValues.modelId || null,
					maxConcurrentSessions: editValues.maxConcurrentSessions,
				}),
			});

			if (res.status === 422) {
				const msg = await extract422Error(res);
				setEditError(msg);
				return;
			}

			if (!res.ok) {
				showToast("Failed to save agent");
				return;
			}

			const updated = (await res.json()) as AgentConfig;
			setAgents((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
			setEditingId(null);
			setEditValues(null);
			showToast("Agent saved");
		} catch {
			showToast("Failed to save agent");
		} finally {
			setSaving(false);
		}
	}, [editingId, editValues, showToast]);

	const handleAddSave = useCallback(async (): Promise<void> => {
		setAdding(true);
		setAddError(null);
		try {
			const res = await apiFetch("/api/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: addValues.name,
					role: addValues.role,
					soulPrompt: addValues.soulPrompt || null,
					harnessType: addValues.harnessType || null,
					modelId: addValues.modelId || null,
					maxConcurrentSessions: addValues.maxConcurrentSessions,
				}),
			});

			if (res.status === 422) {
				const msg = await extract422Error(res);
				setAddError(msg);
				return;
			}

			if (!res.ok) {
				showToast("Failed to create agent");
				return;
			}

			const created = (await res.json()) as AgentConfig;
			setAgents((prev) => [...prev, created]);
			setAddMode(false);
			setAddValues({
				name: "",
				role: "builder",
				soulPrompt: "",
				harnessType: "",
				modelId: "",
				maxConcurrentSessions: 1,
			});
			showToast("Agent created");
		} catch {
			showToast("Failed to create agent");
		} finally {
			setAdding(false);
		}
	}, [addValues, showToast]);

	const handleDeleteFirstClick = useCallback((agentId: string): void => {
		if (deleteTimeoutRef.current) {
			clearTimeout(deleteTimeoutRef.current);
		}
		setConfirmingDeleteId(agentId);
		deleteTimeoutRef.current = setTimeout(() => {
			setConfirmingDeleteId(null);
			deleteTimeoutRef.current = null;
		}, 3000);
	}, []);

	const handleDeleteConfirm = useCallback(
		async (agentId: string): Promise<void> => {
			if (deleteTimeoutRef.current) {
				clearTimeout(deleteTimeoutRef.current);
				deleteTimeoutRef.current = null;
			}
			setConfirmingDeleteId(null);
			try {
				const res = await apiFetch(`/api/agents/${encodeURIComponent(agentId)}`, {
					method: "DELETE",
				});
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				setAgents((prev) => prev.filter((a) => a.id !== agentId));
				showToast("Agent deleted");
			} catch {
				showToast("Failed to delete agent");
			}
		},
		[showToast],
	);

	// ---------------------------------------------------------------------------
	// Loading / error / empty states
	// ---------------------------------------------------------------------------

	if (status === "loading") {
		return (
			<div className="flex flex-col gap-3">
				<div className="skeleton h-8 w-full" />
				<div className="skeleton h-8 w-full" />
			</div>
		);
	}

	if (status === "error") {
		return <p className="text-sm text-error">Failed to load agents. Please try again.</p>;
	}

	// AH2: Set of registered harness types for availability checking
	const registeredHarnessTypes = new Set(harnesses.map((h) => h.type));

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

	// ---------------------------------------------------------------------------
	// Render helpers
	// ---------------------------------------------------------------------------

	function renderEditForm(
		values: EditFormValues,
		setValues: (fn: (prev: EditFormValues) => EditFormValues) => void,
		error: string | null,
		onSave: () => void,
		onCancel: () => void,
		isSaving: boolean,
		agentId: string,
	): JSX.Element {
		return (
			<div className="flex flex-col gap-[12px] p-3 border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
				<div className="flex gap-2 flex-wrap">
					<div className="form-control flex-1 min-w-[140px]">
						<label className="label" htmlFor={`edit-name-${agentId}`}>
							<span className="label-text text-[var(--text-secondary)]">Name</span>
						</label>
						<input
							id={`edit-name-${agentId}`}
							type="text"
							className="input input-sm input-bordered"
							value={values.name}
							onChange={(e) => {
								setValues((prev) => ({ ...prev, name: e.target.value }));
								if (error) setEditError(null);
							}}
							aria-label="Name"
						/>
					</div>

					<div className="form-control flex-1 min-w-[140px]">
						<label className="label" htmlFor={`edit-role-${agentId}`}>
							<span className="label-text text-[var(--text-secondary)]">Role</span>
						</label>
						<Select
							id={`edit-role-${agentId}`}
							size="sm"
							value={values.role}
							onChange={(e) => {
								setValues((prev) => ({ ...prev, role: e.target.value }));
								if (error) setEditError(null);
							}}
							aria-label="Role"
							options={AGENT_ROLE_CATALOG.map((entry) => ({
								value: entry.role,
								label: entry.label,
							}))}
						/>
					</div>

					{/* AH2: Harness Select — constrained to registered types */}
					<div className="form-control flex-1 min-w-[140px]">
						<label className="label" htmlFor={`edit-harness-${agentId}`}>
							<span className="label-text text-[var(--text-secondary)]">Harness</span>
						</label>
						<Select
							id={`edit-harness-${agentId}`}
							size="sm"
							className="max-md:text-[16px]"
							value={values.harnessType}
							onChange={(e) => {
								setValues((prev) => ({ ...prev, harnessType: e.target.value }));
								if (error) setEditError(null);
							}}
							aria-label="Harness"
							options={harnessOptions}
						/>
					</div>

					{/* AH2: Model Select from MODEL_CATALOG — replaces Model Tier */}
					<div className="form-control flex-1 min-w-[140px]">
						<label className="label" htmlFor={`edit-model-${agentId}`}>
							<span className="label-text text-[var(--text-secondary)]">Model</span>
						</label>
						<Select
							id={`edit-model-${agentId}`}
							size="sm"
							className="max-md:text-[16px]"
							value={values.modelId}
							onChange={(e) => {
								setValues((prev) => ({ ...prev, modelId: e.target.value }));
								if (error) setEditError(null);
							}}
							aria-label="Model"
							options={modelOptions}
						/>
					</div>

					<div className="form-control flex-1 min-w-[100px]">
						<label className="label" htmlFor={`edit-sessions-${agentId}`}>
							<span className="label-text text-[var(--text-secondary)]">Max Sessions</span>
						</label>
						<input
							id={`edit-sessions-${agentId}`}
							type="number"
							className="input input-sm input-bordered"
							value={values.maxConcurrentSessions}
							min={1}
							max={20}
							onChange={(e) =>
								setValues((prev) => ({ ...prev, maxConcurrentSessions: Number(e.target.value) }))
							}
							aria-label="Max Sessions"
						/>
					</div>
				</div>

				<div className="form-control">
					<label className="label" htmlFor={`edit-soul-${agentId}`}>
						<span className="label-text text-[var(--text-secondary)]">Soul Prompt</span>
					</label>
					{/* AH3: Explicit --r-default radius (≤16px) — DaisyUI .textarea uses --rounded-btn (~8px).
					    Either satisfies the E2E border-radius ≤ 16px check. */}
					<textarea
						id={`edit-soul-${agentId}`}
						className="textarea textarea-bordered text-sm"
						rows={8}
						value={values.soulPrompt}
						onChange={(e) => setValues((prev) => ({ ...prev, soulPrompt: e.target.value }))}
						placeholder="Soul prompt text (optional). Leave empty for no persona."
						aria-label="Soul Prompt"
						style={{ borderRadius: "var(--r-default)" }}
					/>
				</div>

				{/* AH2 DESIGN-1: Inline 422 error above Save/Cancel */}
				{error && (
					<p className="text-sm text-[var(--status-error)]" role="alert">
						{error}
					</p>
				)}

				<div className="flex gap-2 justify-end">
					<button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-primary btn-sm"
						onClick={onSave}
						disabled={isSaving}
					>
						{isSaving && <span className="loading loading-spinner loading-xs" />}
						Save
					</button>
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<div className="flex flex-col gap-3">
			{agents.length === 0 && !addMode ? (
				<p className="text-sm text-[var(--text-tertiary)]">No agents configured.</p>
			) : (
				<table className="table table-xs w-full">
					<thead>
						<tr>
							<th className="text-[var(--text-tertiary)]">Name</th>
							<th className="text-[var(--text-tertiary)]">Role</th>
							<th className="text-[var(--text-tertiary)]">Harness</th>
							<th className="text-[var(--text-tertiary)]">Model</th>
							<th className="text-[var(--text-tertiary)]">Sessions</th>
							<th className="text-[var(--text-tertiary)]">Actions</th>
						</tr>
					</thead>
					<tbody>
						{/* AH3: Filter out assistant agents (role==="assistant") — the assistant persona is
						    managed in Settings → Assistant, not here. Prevents accidental dual-editing. */}
						{agents
							.filter((a) => a.role !== "assistant")
							.map((agent) => {
								// AH2: Check if agent's harnessType is in the registry
								const harnessUnavailable =
									agent.harnessType != null && !registeredHarnessTypes.has(agent.harnessType);
								return (
									<Fragment key={agent.id}>
										<tr data-agent-role={agent.role}>
											<td className="text-sm">
												{agent.name}
												{/* AH2: StatusChip warning for unavailable harness */}
												{harnessUnavailable && (
													<span className="ml-2 badge badge-sm badge-warning text-[10px]">
														Harness unavailable
													</span>
												)}
											</td>
											<td className="text-sm">
												<span className="badge badge-sm badge-ghost font-mono">{agent.role}</span>
											</td>
											<td className="text-sm font-mono text-[var(--text-secondary)]">
												{agent.harnessType ?? "Default"}
											</td>
											<td className="text-sm font-mono text-[var(--text-secondary)]">
												{agent.modelId ?? "Default"}
											</td>
											<td className="text-sm tabular-nums">{agent.activeSessions}</td>
											<td>
												<div className="flex gap-1">
													<button
														type="button"
														className="btn btn-ghost btn-xs"
														onClick={() => handleEditOpen(agent)}
														aria-label={`Edit ${agent.name}`}
													>
														Edit
													</button>
													{confirmingDeleteId === agent.id ? (
														<button
															type="button"
															className="btn btn-ghost btn-xs text-error"
															onClick={() => handleDeleteConfirm(agent.id)}
														>
															Confirm?
														</button>
													) : (
														<button
															type="button"
															className="btn btn-ghost btn-xs text-error"
															onClick={() => handleDeleteFirstClick(agent.id)}
															aria-label={`Delete ${agent.name}`}
														>
															Delete
														</button>
													)}
												</div>
											</td>
										</tr>
										{editingId === agent.id && editValues && (
											<tr key={`${agent.id}-edit`}>
												<td colSpan={6}>
													{renderEditForm(
														editValues,
														(fn) => setEditValues((prev) => (prev ? fn(prev) : prev)),
														editError,
														handleEditSave,
														handleEditCancel,
														saving,
														agent.id,
													)}
												</td>
											</tr>
										)}
									</Fragment>
								);
							})}
					</tbody>
				</table>
			)}

			{/* Add form or button */}
			{addMode ? (
				<div className="flex flex-col gap-2 p-3 border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
					<div className="flex gap-2 flex-wrap">
						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-name">
								<span className="label-text text-[var(--text-secondary)]">Name</span>
							</label>
							<input
								id="add-agent-name"
								type="text"
								className="input input-sm input-bordered"
								value={addValues.name}
								onChange={(e) => {
									setAddValues((prev) => ({ ...prev, name: e.target.value }));
									if (addError) setAddError(null);
								}}
								aria-label="Name"
								placeholder="Agent name"
							/>
						</div>

						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-role">
								<span className="label-text text-[var(--text-secondary)]">Role</span>
							</label>
							<Select
								id="add-agent-role"
								size="sm"
								value={addValues.role}
								onChange={(e) => {
									const newRole = e.target.value;
									setAddValues((prev) => ({ ...prev, role: newRole, soulPrompt: "" }));
									void fetchTemplate(newRole);
								}}
								aria-label="Role"
								options={AGENT_ROLE_CATALOG.map((entry) => ({
									value: entry.role,
									label: entry.label,
								}))}
							/>
						</div>

						{/* AH2: Harness Select — constrained to registered types */}
						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-harness">
								<span className="label-text text-[var(--text-secondary)]">Harness</span>
							</label>
							<Select
								id="add-agent-harness"
								size="sm"
								className="max-md:text-[16px]"
								value={addValues.harnessType}
								onChange={(e) => {
									setAddValues((prev) => ({ ...prev, harnessType: e.target.value }));
									if (addError) setAddError(null);
								}}
								aria-label="Harness"
								options={harnessOptions}
							/>
						</div>

						{/* AH2: Model Select from MODEL_CATALOG */}
						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-model">
								<span className="label-text text-[var(--text-secondary)]">Model</span>
							</label>
							<Select
								id="add-agent-model"
								size="sm"
								className="max-md:text-[16px]"
								value={addValues.modelId}
								onChange={(e) => {
									setAddValues((prev) => ({ ...prev, modelId: e.target.value }));
									if (addError) setAddError(null);
								}}
								aria-label="Model"
								options={modelOptions}
							/>
						</div>

						<div className="form-control flex-1 min-w-[100px]">
							<label className="label" htmlFor="add-agent-sessions">
								<span className="label-text text-[var(--text-secondary)]">Max Sessions</span>
							</label>
							<input
								id="add-agent-sessions"
								type="number"
								className="input input-sm input-bordered"
								value={addValues.maxConcurrentSessions}
								min={1}
								max={20}
								onChange={(e) =>
									setAddValues((prev) => ({
										...prev,
										maxConcurrentSessions: Number(e.target.value),
									}))
								}
								aria-label="Max Sessions"
							/>
						</div>
					</div>

					<div className="form-control">
						<label className="label" htmlFor="add-agent-soul">
							<span className="label-text text-[var(--text-secondary)]">Soul Prompt</span>
						</label>
						<textarea
							id="add-agent-soul"
							className="textarea textarea-bordered text-sm"
							rows={8}
							value={addValues.soulPrompt}
							onChange={(e) => setAddValues((prev) => ({ ...prev, soulPrompt: e.target.value }))}
							placeholder="Soul prompt text (optional). Changes with role selection."
							aria-label="Soul Prompt"
							style={{ borderRadius: "var(--r-default)" }}
						/>
					</div>

					{/* AH2 DESIGN-1: Inline 422 error for add form */}
					{addError && (
						<p className="text-sm text-[var(--status-error)]" role="alert">
							{addError}
						</p>
					)}

					<div className="flex gap-2 justify-end">
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							onClick={() => {
								setAddMode(false);
								setAddError(null);
								setAddValues({
									name: "",
									role: "builder",
									soulPrompt: "",
									harnessType: "",
									modelId: "",
									maxConcurrentSessions: 1,
								});
							}}
						>
							Cancel
						</button>
						<button
							type="button"
							className="btn btn-primary btn-sm"
							onClick={handleAddSave}
							disabled={adding || !addValues.name}
						>
							{adding && <span className="loading loading-spinner loading-xs" />}
							Save
						</button>
					</div>
				</div>
			) : (
				<button
					type="button"
					className="btn btn-ghost btn-sm self-start"
					onClick={() => setAddMode(true)}
				>
					+ Add Agent
				</button>
			)}
		</div>
	);
}
