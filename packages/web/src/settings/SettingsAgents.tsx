/**
 * SettingsAgents — Agent Configuration settings section.
 *
 * X3 Task 6: Settings section (AC-9 through AC-12)
 * Displays AI agents with inline edit, add, and two-click delete.
 *
 * - Fetches agents from GET /api/agents (own fetch, no useSettings hook)
 * - Table: Name | Role | Harness | Model Tier | Sessions | Actions
 * - Inline edit row: expands below selected agent with form
 * - Add form: below table, role change fetches template to pre-fill soul prompt
 * - Delete: two-click confirmation with 3-second timeout to revert
 *
 * @lore X3: SettingsAgents follows the SettingsOrgChart pattern — fetch on
 * mount, table display, inline expand for editing. No useSettings hook —
 * uses its own GET /api/agents fetch because the settings response `users`
 * array does not include the X3 config fields (soulPrompt, harnessType, etc.).
 */

// hearth-internal-padding
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { AgentConfig } from "./settings-types.js";

const USER_ROLES = [
	"builder",
	"growth",
	"product_manager",
	"practice_facilitator",
	"chief_of_staff",
	"brand_voice",
] as const;

const MODEL_TIERS = ["reasoning", "workhorse", "fast"] as const;

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------

interface EditFormValues {
	name: string;
	role: string;
	soulPrompt: string;
	harnessType: string;
	modelTierPreference: string;
	maxConcurrentSessions: number;
}

function agentToEditValues(agent: AgentConfig): EditFormValues {
	return {
		name: agent.name,
		role: agent.role,
		soulPrompt: agent.soulPrompt ?? "",
		harnessType: agent.harnessType ?? "",
		modelTierPreference: agent.modelTierPreference ?? "",
		maxConcurrentSessions: agent.maxConcurrentSessions,
	};
}

// ---------------------------------------------------------------------------
// SettingsAgents
// ---------------------------------------------------------------------------

export function SettingsAgents(): JSX.Element {
	const { showToast } = useToast();
	const [agents, setAgents] = useState<AgentConfig[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValues, setEditValues] = useState<EditFormValues | null>(null);
	const [saving, setSaving] = useState(false);
	const [addMode, setAddMode] = useState(false);
	const [addValues, setAddValues] = useState<EditFormValues>({
		name: "",
		role: "builder",
		soulPrompt: "",
		harnessType: "",
		modelTierPreference: "",
		maxConcurrentSessions: 1,
	});
	const [adding, setAdding] = useState(false);
	// Two-click delete state: map of agentId → timeout ref
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const loadAgents = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/agents");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as AgentConfig[];
			setAgents(json);
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
				setAddMode(false);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	// Fetch template when role changes in add form
	const fetchTemplate = useCallback(async (role: string): Promise<void> => {
		try {
			const res = await apiFetch(`/api/agents/templates/${encodeURIComponent(role)}`);
			if (!res.ok) return; // No template for this role — leave empty
			const json = (await res.json()) as { role: string; content: string };
			setAddValues((prev) => ({ ...prev, soulPrompt: json.content }));
		} catch {
			// Ignore — template fetch is best-effort
		}
	}, []);

	const handleEditOpen = useCallback((agent: AgentConfig): void => {
		setEditingId(agent.id);
		setEditValues(agentToEditValues(agent));
		setAddMode(false);
	}, []);

	const handleEditCancel = useCallback((): void => {
		setEditingId(null);
		setEditValues(null);
	}, []);

	const handleEditSave = useCallback(async (): Promise<void> => {
		if (!(editingId && editValues)) return;
		setSaving(true);
		try {
			const res = await apiFetch(`/api/agents/${encodeURIComponent(editingId)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: editValues.name,
					role: editValues.role,
					soulPrompt: editValues.soulPrompt || null,
					harnessType: editValues.harnessType || null,
					modelTierPreference: editValues.modelTierPreference || null,
					maxConcurrentSessions: editValues.maxConcurrentSessions,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
		try {
			const res = await apiFetch("/api/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: addValues.name,
					role: addValues.role,
					soulPrompt: addValues.soulPrompt || null,
					harnessType: addValues.harnessType || null,
					modelTierPreference: addValues.modelTierPreference || null,
					maxConcurrentSessions: addValues.maxConcurrentSessions,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const created = (await res.json()) as AgentConfig;
			setAgents((prev) => [...prev, created]);
			setAddMode(false);
			setAddValues({
				name: "",
				role: "builder",
				soulPrompt: "",
				harnessType: "",
				modelTierPreference: "",
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
		// Clear any existing timeout
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
							<th className="text-[var(--text-tertiary)]">Model Tier</th>
							<th className="text-[var(--text-tertiary)]">Sessions</th>
							<th className="text-[var(--text-tertiary)]">Actions</th>
						</tr>
					</thead>
					<tbody>
						{agents.map((agent) => (
							<>
								<tr key={agent.id}>
									<td className="text-sm">{agent.name}</td>
									<td className="text-sm font-mono text-[var(--text-secondary)]">{agent.role}</td>
									<td className="text-sm text-[var(--text-secondary)]">
										{agent.harnessType ?? "Any"}
									</td>
									<td className="text-sm text-[var(--text-secondary)]">
										{agent.modelTierPreference ?? "Default"}
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
											<div className="flex flex-col gap-2 p-3 border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
												<div className="flex gap-2 flex-wrap">
													<div className="form-control flex-1 min-w-[140px]">
														<label className="label" htmlFor={`edit-name-${agent.id}`}>
															<span className="label-text text-[var(--text-secondary)]">Name</span>
														</label>
														<input
															id={`edit-name-${agent.id}`}
															type="text"
															className="input input-sm input-bordered"
															value={editValues.name}
															onChange={(e) =>
																setEditValues((prev) =>
																	prev ? { ...prev, name: e.target.value } : prev,
																)
															}
															aria-label="Name"
														/>
													</div>

													<div className="form-control flex-1 min-w-[140px]">
														<label className="label" htmlFor={`edit-role-${agent.id}`}>
															<span className="label-text text-[var(--text-secondary)]">Role</span>
														</label>
														<select
															id={`edit-role-${agent.id}`}
															className="select select-sm select-bordered"
															value={editValues.role}
															onChange={(e) =>
																setEditValues((prev) =>
																	prev ? { ...prev, role: e.target.value } : prev,
																)
															}
															aria-label="Role"
														>
															{USER_ROLES.map((r) => (
																<option key={r} value={r}>
																	{r}
																</option>
															))}
														</select>
													</div>

													<div className="form-control flex-1 min-w-[140px]">
														<label className="label" htmlFor={`edit-harness-${agent.id}`}>
															<span className="label-text text-[var(--text-secondary)]">
																Harness Type
															</span>
														</label>
														<input
															id={`edit-harness-${agent.id}`}
															type="text"
															className="input input-sm input-bordered"
															value={editValues.harnessType}
															onChange={(e) =>
																setEditValues((prev) =>
																	prev ? { ...prev, harnessType: e.target.value } : prev,
																)
															}
															placeholder="e.g. claude-code"
															aria-label="Harness Type"
														/>
													</div>

													<div className="form-control flex-1 min-w-[140px]">
														<label className="label" htmlFor={`edit-tier-${agent.id}`}>
															<span className="label-text text-[var(--text-secondary)]">
																Model Tier
															</span>
														</label>
														<select
															id={`edit-tier-${agent.id}`}
															className="select select-sm select-bordered"
															value={editValues.modelTierPreference}
															onChange={(e) =>
																setEditValues((prev) =>
																	prev ? { ...prev, modelTierPreference: e.target.value } : prev,
																)
															}
															aria-label="Model Tier"
														>
															<option value="">Default</option>
															{MODEL_TIERS.map((t) => (
																<option key={t} value={t}>
																	{t}
																</option>
															))}
														</select>
													</div>

													<div className="form-control flex-1 min-w-[100px]">
														<label className="label" htmlFor={`edit-sessions-${agent.id}`}>
															<span className="label-text text-[var(--text-secondary)]">
																Max Sessions
															</span>
														</label>
														<input
															id={`edit-sessions-${agent.id}`}
															type="number"
															className="input input-sm input-bordered"
															value={editValues.maxConcurrentSessions}
															min={1}
															max={20}
															onChange={(e) =>
																setEditValues((prev) =>
																	prev
																		? { ...prev, maxConcurrentSessions: Number(e.target.value) }
																		: prev,
																)
															}
															aria-label="Max Sessions"
														/>
													</div>
												</div>

												<div className="form-control">
													<label className="label" htmlFor={`edit-soul-${agent.id}`}>
														<span className="label-text text-[var(--text-secondary)]">
															Soul Prompt
														</span>
													</label>
													<textarea
														id={`edit-soul-${agent.id}`}
														className="textarea textarea-bordered text-sm"
														rows={6}
														value={editValues.soulPrompt}
														onChange={(e) =>
															setEditValues((prev) =>
																prev ? { ...prev, soulPrompt: e.target.value } : prev,
															)
														}
														placeholder="Soul prompt text (optional). Leave empty for no persona."
														aria-label="Soul Prompt"
													/>
												</div>

												<div className="flex gap-2 justify-end">
													<button
														type="button"
														className="btn btn-ghost btn-sm"
														onClick={handleEditCancel}
													>
														Cancel
													</button>
													<button
														type="button"
														className="btn btn-primary btn-sm"
														onClick={handleEditSave}
														disabled={saving}
													>
														{saving && <span className="loading loading-spinner loading-xs" />}
														Save
													</button>
												</div>
											</div>
										</td>
									</tr>
								)}
							</>
						))}
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
								onChange={(e) => setAddValues((prev) => ({ ...prev, name: e.target.value }))}
								aria-label="Name"
								placeholder="Agent name"
							/>
						</div>

						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-role">
								<span className="label-text text-[var(--text-secondary)]">Role</span>
							</label>
							<select
								id="add-agent-role"
								className="select select-sm select-bordered"
								value={addValues.role}
								onChange={(e) => {
									const newRole = e.target.value;
									setAddValues((prev) => ({ ...prev, role: newRole, soulPrompt: "" }));
									void fetchTemplate(newRole);
								}}
								aria-label="Role"
							>
								{USER_ROLES.map((r) => (
									<option key={r} value={r}>
										{r}
									</option>
								))}
							</select>
						</div>

						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-harness">
								<span className="label-text text-[var(--text-secondary)]">Harness Type</span>
							</label>
							<input
								id="add-agent-harness"
								type="text"
								className="input input-sm input-bordered"
								value={addValues.harnessType}
								onChange={(e) => setAddValues((prev) => ({ ...prev, harnessType: e.target.value }))}
								placeholder="e.g. claude-code"
								aria-label="Harness Type"
							/>
						</div>

						<div className="form-control flex-1 min-w-[140px]">
							<label className="label" htmlFor="add-agent-tier">
								<span className="label-text text-[var(--text-secondary)]">Model Tier</span>
							</label>
							<select
								id="add-agent-tier"
								className="select select-sm select-bordered"
								value={addValues.modelTierPreference}
								onChange={(e) =>
									setAddValues((prev) => ({ ...prev, modelTierPreference: e.target.value }))
								}
								aria-label="Model Tier"
							>
								<option value="">Default</option>
								{MODEL_TIERS.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</select>
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
							rows={6}
							value={addValues.soulPrompt}
							onChange={(e) => setAddValues((prev) => ({ ...prev, soulPrompt: e.target.value }))}
							placeholder="Soul prompt text (optional). Changes with role selection."
							aria-label="Soul Prompt"
						/>
					</div>

					<div className="flex gap-2 justify-end">
						<button
							type="button"
							className="btn btn-ghost btn-sm"
							onClick={() => {
								setAddMode(false);
								setAddValues({
									name: "",
									role: "builder",
									soulPrompt: "",
									harnessType: "",
									modelTierPreference: "",
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
