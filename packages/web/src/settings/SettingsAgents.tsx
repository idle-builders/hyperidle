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
 * - Add form: below table, role change fetches template to pre-fill system prompt
 * - Delete: two-click confirmation with 3-second timeout to revert
 *
 * @lore X3: SettingsAgents follows the SettingsOrgChart pattern — fetch on
 * mount, table display, inline expand for editing. No useSettings hook —
 * uses its own GET /api/agents fetch because the settings response `users`
 * array does not include the X3 config fields (systemPrompt, harnessType, etc.).
 *
 * @lore AH2: Harness Select is populated from GET /api/harnesses (registry-driven).
 * Model Select is populated from MODEL_CATALOG (closed catalog). Free-text harness
 * input removed — unregistered harnesses are rejected by the API anyway.
 */

import {
	Button,
	EmptyState,
	ErrorState,
	Input,
	Select,
	SkeletonList,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import { AGENT_ROLE_CATALOG, MODEL_CATALOG } from "@hyperidle/shared";
// hearth-internal-padding
import { Fragment, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { AgentConfig, InjectableFilesystem } from "./settings-types.js";

// ---------------------------------------------------------------------------
// Harness registry type
// ---------------------------------------------------------------------------

interface HarnessEntry {
	type: string;
	name: string;
	modelProviders: string[];
}

// ---------------------------------------------------------------------------
// Org teams type (from GET /api/org)
// ---------------------------------------------------------------------------

interface OrgTeam {
	id: string; // teamMembers.id — correct FK for users.teamId
	name: string;
	/** AO1: teams.id — the registry scope key for filesystem queries (filesystems.team_id). */
	teamActualId?: string;
}

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------

interface EditFormValues {
	name: string;
	role: string;
	systemPrompt: string;
	harnessType: string;
	modelId: string;
	maxConcurrentSessions: number;
	/** AO1: registered-filesystem ids injected into this bot (per-bot injection). */
	filesystemIds: string[];
}

function agentToEditValues(agent: AgentConfig): EditFormValues {
	return {
		name: agent.name,
		role: agent.role,
		systemPrompt: agent.systemPrompt ?? "",
		harnessType: agent.harnessType ?? "",
		modelId: agent.modelId ?? "",
		maxConcurrentSessions: agent.maxConcurrentSessions,
		filesystemIds: agent.filesystemIds ?? [],
	};
}

/** AO1: human label for a filesystem source — the easy-to-detect mark text. */
function fsSourceLabel(source: string): string {
	if (source === "github") return "GitHub";
	if (source === "gdrive") return "Google Drive";
	if (source === "obsidian") return "Obsidian";
	if (source === "local") return "Local";
	return source;
}

// ---------------------------------------------------------------------------
// AO1: per-bot Filesystems injection control.
//
// Mirrors how Harness/Model are configured (a labeled control drawn from a
// registry), but injection is many-valued, so it is an add-remove list: the
// currently-injected filesystems render as removable rows — each led by its
// `source` Tag (the same easy-to-detect mark the registry uses) — and a Select
// adds the next un-injected filesystem from the team registry. Reuses Select +
// Tag + Button; no bespoke multiselect shape.
// ---------------------------------------------------------------------------

function FilesystemInjectionControl({
	registry,
	selectedIds,
	onChange,
	idPrefix,
}: {
	registry: InjectableFilesystem[];
	selectedIds: string[];
	onChange: (next: string[]) => void;
	idPrefix: string;
}): JSX.Element {
	const selected = selectedIds
		.map((id) => registry.find((fs) => fs.id === id))
		.filter((fs): fs is InjectableFilesystem => fs != null);
	const available = registry.filter((fs) => !selectedIds.includes(fs.id));

	return (
		<div className="flex flex-col gap-[6px]">
			<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
				Filesystems
			</span>
			<p className="text-[12px] text-[var(--text-tertiary)]">
				Registered filesystems injected into this bot's sandbox. Register new ones in Settings →
				Filesystems.
			</p>
			{selected.length > 0 ? (
				<div className="flex flex-col overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)]">
					{selected.map((fs, index) => (
						<div key={fs.id}>
							{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
							<div className="flex items-center gap-[9px] px-[9px] py-[6px]">
								<div className="shrink-0">
									<Tag label={fsSourceLabel(fs.source)} />
								</div>
								<span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-primary)]">
									{fs.resource}
								</span>
								<Tag label={fs.kind} />
								<Button
									variant="ghost"
									size="sm"
									aria-label={`Remove ${fs.resource} from this bot`}
									onClick={() => onChange(selectedIds.filter((id) => id !== fs.id))}
								>
									Remove
								</Button>
							</div>
						</div>
					))}
				</div>
			) : (
				<p className="text-[12px] text-[var(--text-tertiary)]">No filesystems injected yet.</p>
			)}
			{available.length > 0 ? (
				<div className="max-w-[280px]">
					<Select
						id={`${idPrefix}-add-filesystem`}
						label="Inject a filesystem"
						size="sm"
						value=""
						onChange={(e) => {
							const id = e.target.value;
							if (id) onChange([...selectedIds, id]);
						}}
						aria-label="Inject a filesystem"
						options={[
							{ value: "", label: "Add from registry…" },
							...available.map((fs) => ({
								value: fs.id,
								label: `${fsSourceLabel(fs.source)} · ${fs.resource}`,
							})),
						]}
					/>
				</div>
			) : null}
		</div>
	);
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
	// AO1: the team's registered filesystems — the pool the per-bot injection draws from.
	const [filesystems, setFilesystems] = useState<InjectableFilesystem[]>([]);
	const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([]);
	const [orgTeamsStatus, setOrgTeamsStatus] = useState<"loading" | "ready" | "error">("loading");
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editValues, setEditValues] = useState<EditFormValues | null>(null);
	const [editError, setEditError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [addMode, setAddMode] = useState(false);
	const [addValues, setAddValues] = useState<EditFormValues>({
		name: "",
		role: "builder",
		systemPrompt: "",
		harnessType: "",
		modelId: "",
		maxConcurrentSessions: 1,
		filesystemIds: [],
	});
	// AH4: selected teamId for the add form (teamMembers.id from GET /api/org)
	const [addTeamId, setAddTeamId] = useState<string | null>(null);
	const [addError, setAddError] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	// Two-click delete state
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const loadAgents = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const [agentsRes, harnessesRes, orgRes] = await Promise.all([
				apiFetch("/api/agents"),
				apiFetch("/api/harnesses"),
				apiFetch("/api/org"),
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
			// AH4: load teams from GET /api/org; default addTeamId to first team's id
			if (orgRes.ok) {
				const orgJson = (await orgRes.json()) as { teams?: OrgTeam[] };
				const teamList = Array.isArray(orgJson.teams) ? orgJson.teams : [];
				setOrgTeams(teamList);
				setOrgTeamsStatus("ready");
				if (teamList.length > 0) {
					setAddTeamId(teamList[0]?.id ?? null);
				}
				// AO1: load the team filesystem registry — the per-bot injection pool.
				// Must use teams.id (filesystems.team_id scope), not teamMembers.id.
				// teamActualId = teams.id added to /api/org response in AO1.
				const firstTeamActualId = teamList[0]?.teamActualId;
				if (firstTeamActualId) {
					const filesystemsRes = await apiFetch(
						`/api/filesystems?teamId=${encodeURIComponent(firstTeamActualId)}`,
					);
					if (filesystemsRes.ok) {
						const fsJson = (await filesystemsRes.json()) as {
							filesystems?: InjectableFilesystem[];
						};
						if (Array.isArray(fsJson.filesystems)) {
							setFilesystems(fsJson.filesystems);
						}
					}
				}
			} else {
				setOrgTeamsStatus("error");
			}
			setStatus("ready");
		} catch {
			setStatus("error");
			setOrgTeamsStatus("error");
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
			setAddValues((prev) => ({ ...prev, systemPrompt: json.content }));
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
					systemPrompt: editValues.systemPrompt || null,
					harnessType: editValues.harnessType || null,
					modelId: editValues.modelId || null,
					maxConcurrentSessions: editValues.maxConcurrentSessions,
					filesystemIds: editValues.filesystemIds,
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
					systemPrompt: addValues.systemPrompt || null,
					harnessType: addValues.harnessType || null,
					modelId: addValues.modelId || null,
					maxConcurrentSessions: addValues.maxConcurrentSessions,
					filesystemIds: addValues.filesystemIds,
					// AH4: include selected teamId (teamMembers.id); null = explicit unassigned
					teamId: addTeamId,
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
				systemPrompt: "",
				harnessType: "",
				modelId: "",
				maxConcurrentSessions: 1,
				filesystemIds: [],
			});
			showToast("Agent created");
		} catch {
			showToast("Failed to create agent");
		} finally {
			setAdding(false);
		}
	}, [addValues, addTeamId, showToast]);

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
		return <SkeletonList rows={2} ariaLabel="Loading agents" />;
	}

	if (status === "error") {
		return (
			<ErrorState
				compact
				title="Couldn't load agents"
				description="Failed to load agents. Please try again."
				onRetry={() => void loadAgents()}
			/>
		);
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
			<div className="flex flex-col gap-[12px] p-[12px] border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
				<div className="flex gap-[9px] flex-wrap">
					<div className="flex-1 min-w-[140px]">
						<Input
							id={`edit-name-${agentId}`}
							label="Name"
							type="text"
							value={values.name}
							onChange={(e) => {
								setValues((prev) => ({ ...prev, name: e.target.value }));
								if (error) setEditError(null);
							}}
							aria-label="Name"
						/>
					</div>

					<div className="flex-1 min-w-[140px]">
						<Select
							id={`edit-role-${agentId}`}
							label="Role"
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
					<div className="flex-1 min-w-[140px]">
						<Select
							id={`edit-harness-${agentId}`}
							label="Harness"
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
					<div className="flex-1 min-w-[140px]">
						<Select
							id={`edit-model-${agentId}`}
							label="Model"
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

					<div className="flex-1 min-w-[100px]">
						<div className="w-[88px]">
							<Input
								id={`edit-sessions-${agentId}`}
								label="Max Sessions"
								type="number"
								value={String(values.maxConcurrentSessions)}
								min={1}
								max={20}
								onChange={(e) =>
									setValues((prev) => ({ ...prev, maxConcurrentSessions: Number(e.target.value) }))
								}
								aria-label="Max Sessions"
							/>
						</div>
					</div>
				</div>

				{/* AH3 D4: Migrated to design-system Input textarea (prose font, --r-default radius). */}
				<Input
					id={`edit-system-prompt-${agentId}`}
					label="System prompt"
					textarea
					rows={8}
					value={values.systemPrompt}
					onChange={(e) =>
						setValues((prev) => ({
							...prev,
							systemPrompt: e.target.value,
						}))
					}
					placeholder="System prompt text (optional). Leave empty for no persona."
				/>

				{/* AO1: per-bot Filesystems injection — which registered filesystems this bot gets. */}
				<FilesystemInjectionControl
					registry={filesystems}
					selectedIds={values.filesystemIds}
					onChange={(next) => setValues((prev) => ({ ...prev, filesystemIds: next }))}
					idPrefix={`edit-${agentId}`}
				/>

				{/* AH2 DESIGN-1: Inline 422 error above Save/Cancel */}
				{error && (
					<p className="text-[12px] text-[var(--status-error)]" role="alert">
						{error}
					</p>
				)}

				<div className="flex gap-[9px] justify-end">
					<Button variant="ghost" size="sm" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" onClick={onSave} disabled={isSaving}>
						{isSaving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<div className="flex flex-col gap-[12px]">
			{agents.length === 0 && !addMode ? (
				<EmptyState
					compact
					title="No agents configured"
					description="Add an agent to configure name, role, harness, model, and sessions."
				/>
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
											<td className="text-[13px]">
												{agent.name}
												{/* AH2: StatusChip amber warning for unavailable harness.
												 * @lore AG7: behind=amber per design §1.9 — harness unavailable
												 * is a degraded/recoverable state, NOT blue (paused) or red (blocked). */}
												{harnessUnavailable && (
													<span className="ml-[9px]">
														<StatusChip status="behind" label="Harness unavailable" />
													</span>
												)}
											</td>
											<td className="text-[13px]">
												<Tag label={agent.role} />
											</td>
											<td className="text-[13px] font-mono text-[var(--text-secondary)]">
												{agent.harnessType ?? "Default"}
											</td>
											<td className="text-[13px] font-mono text-[var(--text-secondary)]">
												{agent.modelId ?? "Default"}
											</td>
											<td className="text-[13px] tabular-nums">{agent.activeSessions}</td>
											<td>
												<div className="flex gap-[6px]">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleEditOpen(agent)}
														aria-label={`Edit ${agent.name}`}
													>
														Edit
													</Button>
													{confirmingDeleteId === agent.id ? (
														<Button
															variant="ghost"
															size="sm"
															className="text-[var(--status-error)]"
															onClick={() => handleDeleteConfirm(agent.id)}
														>
															Confirm?
														</Button>
													) : (
														<Button
															variant="ghost"
															size="sm"
															className="text-[var(--status-error)]"
															onClick={() => handleDeleteFirstClick(agent.id)}
															aria-label={`Delete ${agent.name}`}
														>
															Delete
														</Button>
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
				<div className="flex flex-col gap-[12px] p-[12px] border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
					{/* AH4: Team placement picker — first field, above name (design spec: placement before identity) */}
					<Select
						label="Team"
						size="sm"
						value={addTeamId ?? ""}
						onChange={(e) => setAddTeamId(e.target.value || null)}
						disabled={orgTeamsStatus === "loading" || orgTeams.length === 0}
						options={
							orgTeamsStatus === "loading"
								? [{ value: "", label: "Loading teams…", disabled: true }]
								: orgTeams.length === 0
									? [{ value: "", label: "No teams — run Setup to create one", disabled: true }]
									: orgTeams.map((t) => ({ value: t.id, label: t.name }))
						}
					/>

					<div className="flex gap-[9px] flex-wrap">
						<div className="flex-1 min-w-[140px]">
							<Input
								id="add-agent-name"
								label="Name"
								type="text"
								value={addValues.name}
								onChange={(e) => {
									setAddValues((prev) => ({ ...prev, name: e.target.value }));
									if (addError) setAddError(null);
								}}
								aria-label="Name"
								placeholder="Agent name"
							/>
						</div>

						<div className="flex-1 min-w-[140px]">
							<Select
								id="add-agent-role"
								label="Role"
								size="sm"
								value={addValues.role}
								onChange={(e) => {
									const newRole = e.target.value;
									setAddValues((prev) => ({ ...prev, role: newRole, systemPrompt: "" }));
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
						<div className="flex-1 min-w-[140px]">
							<Select
								id="add-agent-harness"
								label="Harness"
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
						<div className="flex-1 min-w-[140px]">
							<Select
								id="add-agent-model"
								label="Model"
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

						<div className="flex-1 min-w-[100px]">
							<div className="w-[88px]">
								<Input
									id="add-agent-sessions"
									label="Max Sessions"
									type="number"
									value={String(addValues.maxConcurrentSessions)}
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
					</div>

					{/* AH3 D4: Migrated to design-system Input textarea (prose font, --r-default radius). */}
					<Input
						id="add-agent-system-prompt"
						label="System prompt"
						textarea
						rows={8}
						value={addValues.systemPrompt}
						onChange={(e) =>
							setAddValues((prev) => ({
								...prev,
								systemPrompt: e.target.value,
							}))
						}
						placeholder="System prompt text (optional). Changes with role selection."
					/>

					{/* AO1: per-bot Filesystems injection on the add form. */}
					<FilesystemInjectionControl
						registry={filesystems}
						selectedIds={addValues.filesystemIds}
						onChange={(next) => setAddValues((prev) => ({ ...prev, filesystemIds: next }))}
						idPrefix="add-agent"
					/>

					{/* AH2 DESIGN-1: Inline 422 error for add form */}
					{addError && (
						<p className="text-[12px] text-[var(--status-error)]" role="alert">
							{addError}
						</p>
					)}

					<div className="flex gap-[9px] justify-end">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setAddMode(false);
								setAddError(null);
								setAddValues({
									name: "",
									role: "builder",
									systemPrompt: "",
									harnessType: "",
									modelId: "",
									maxConcurrentSessions: 1,
									filesystemIds: [],
								});
								setAddTeamId(orgTeams.length > 0 ? (orgTeams[0]?.id ?? null) : null);
							}}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={handleAddSave}
							disabled={adding || !addValues.name}
						>
							{adding ? "Saving…" : "Save"}
						</Button>
					</div>
				</div>
			) : (
				<Button variant="ghost" size="sm" className="self-start" onClick={() => setAddMode(true)}>
					+ Add Agent
				</Button>
			)}
		</div>
	);
}
