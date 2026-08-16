/**
 * SettingsAgents — Agent Configuration settings section.
 *
 * AV2: Rewritten to use SplitView + ItemList/Row. Key changes:
 *  - Remove `role !== "assistant"` filter — assistant is now a row in the list.
 *  - Use AgentEditor (shared editor) in the SplitView destination pane.
 *  - Model dropdown reads descriptor.models (discovered), NOT MODEL_CATALOG.
 *  - SplitView ratio persisted via useUiPreference("settings.agents", 0.42).
 *  - Save routing: ast-* → PATCH /api/users/:userId/assistant; others → /api/agents/:id.
 *
 * @lore AV2: The assistant (ast-*) was previously filtered out of this list and
 * managed in SettingsAssistant. AV2 unifies: the assistant IS an agent. The row
 * filter at :753 is removed; SettingsAssistant.tsx is deleted.
 *
 * @lore AV2: Model options now come from descriptor.models (discovered at probe time
 * by probeBuiltinGateway/probeClaudeCodeCli/probeOpenCodeCli), NOT from MODEL_CATALOG.
 * This is the founder concept-review blocking tweak. modelOptionsForHarness() is the
 * single source of truth for options.
 *
 * @lore AV2: SplitView ratio persistence requires wiring
 * const [ratio, setRatio] = useUiPreference(key, default)
 * then dividerRatio={ratio} onRatioChange={setRatio} — surfaceKey alone is
 * presentational/informational only (SplitView.tsx:46 @lore AM5 T6).
 */

// hearth-internal-padding

import type { FoldMode } from "@hyperidle/design-system";
import {
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	Row,
	SkeletonList,
	SplitView,
	StatusChip,
} from "@hyperidle/design-system";
import { roleLabel } from "@hyperidle/domain-model";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { fetchActiveRunCounts } from "../services/agent-runs.js";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";
import type { AgentEditorDraft } from "./AgentEditor.js";
import { AgentEditor } from "./AgentEditor.js";
import type { AgentConfig, InjectableFilesystem } from "./settings-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgTeam {
	id: string;
	name: string;
	teamActualId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentToEditorDraft(agent: AgentConfig): AgentEditorDraft {
	return {
		name: agent.name,
		role: agent.role,
		systemPrompt: agent.systemPrompt ?? "",
		harnessType: agent.harnessType ?? "",
		modelId: agent.modelId ?? "",
		modelProvider: agent.modelProvider ?? null,
		maxConcurrentSessions: agent.maxConcurrentSessions,
		filesystemIds: agent.filesystemIds ?? [],
	};
}

/**
 * AH2: Parse a structured 422 error body to get the human-readable message.
 * Returns null for non-422 errors (those go to toast).
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
	const [harnesses, setHarnesses] = useState<HarnessCapabilityDescriptor[]>([]);
	const [filesystems, setFilesystems] = useState<InjectableFilesystem[]>([]);
	const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([]);
	/**
	 * @lore AU26 J4: the "N active" count per agent used to ride on
	 * `GET /api/agents` (and on both PATCH responses, purely so the client could
	 * splice it back into the list row). Core-api no longer reads
	 * `agent-orchestration`'s `sessions` table; this map comes straight from the
	 * Layer that owns it. Keeping it in its own state also removes the splice
	 * problem outright — a save no longer has to carry a run count.
	 */
	const [activeRunCounts, setActiveRunCounts] = useState<Readonly<Record<string, number>>>({});
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	// SplitView state
	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("settings.agents", 0.42);
	const { sidebarMobile } = useViewportBreakpoint();

	// Editor state (for the selected agent)
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState<AgentEditorDraft | null>(null);
	const [editOriginalFsIds, setEditOriginalFsIds] = useState<string[]>([]);
	const [editError, setEditError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	// Add mode state
	const [addMode, setAddMode] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [addDraft, setAddDraft] = useState<AgentEditorDraft>({
		name: "",
		role: "builder",
		systemPrompt: "",
		harnessType: "",
		modelId: "",
		modelProvider: null,
		maxConcurrentSessions: 1,
		filesystemIds: [],
	});

	// Delete confirmation state
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
	const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// ---------------------------------------------------------------------------
	// Data loading
	// ---------------------------------------------------------------------------

	const loadTeamFilesystems = useCallback(
		async (teamActualId: string | undefined): Promise<void> => {
			if (!teamActualId) return;
			const filesystemsRes = await apiFetch(
				`/api/filesystems?teamId=${encodeURIComponent(teamActualId)}`,
			);
			if (filesystemsRes.ok) {
				const fsJson = (await filesystemsRes.json()) as { filesystems?: InjectableFilesystem[] };
				if (Array.isArray(fsJson.filesystems)) setFilesystems(fsJson.filesystems);
			}
		},
		[],
	);

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

			// AU26 J4: run counts from agent-orchestration's own API. A failure here
			// must not fail the page — the agent list is core's data and stands on
			// its own; the counts simply render as 0.
			const counts: Readonly<Record<string, number>> = await fetchActiveRunCounts().catch(
				() => ({}),
			);
			setActiveRunCounts(counts);

			if (harnessesRes.ok) {
				const harnessesJson = (await harnessesRes.json()) as HarnessCapabilityDescriptor[];
				if (Array.isArray(harnessesJson)) setHarnesses(harnessesJson);
			}

			if (orgRes.ok) {
				const orgJson = (await orgRes.json()) as { teams?: OrgTeam[] };
				const teamList = Array.isArray(orgJson.teams) ? orgJson.teams : [];
				setOrgTeams(teamList);
				const firstTeamActualId = teamList[0]?.teamActualId;
				await loadTeamFilesystems(firstTeamActualId);
			}
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, [loadTeamFilesystems]);

	useEffect(() => {
		void loadAgents();
	}, [loadAgents]);

	// ---------------------------------------------------------------------------
	// Agent row click → open editor
	// ---------------------------------------------------------------------------

	const handleAgentClick = useCallback(async (agent: AgentConfig): Promise<void> => {
		setEditError(null);
		setAddMode(false);

		// Load the agent's currently-injected filesystems
		let injectedIds: string[] = [];
		try {
			const injRes = await apiFetch(`/api/filesystems?agentUserId=${encodeURIComponent(agent.id)}`);
			if (injRes.ok) {
				const injJson = (await injRes.json()) as { filesystems?: Array<{ id: string }> };
				if (Array.isArray(injJson.filesystems)) {
					injectedIds = injJson.filesystems.map((f) => f.id);
				}
			}
		} catch {
			// non-fatal
		}

		setEditOriginalFsIds(injectedIds);
		setDraft({ ...agentToEditorDraft(agent), filesystemIds: injectedIds });
		setSelectedId(agent.id);
		setSplitMode("split");
	}, []);

	const handleEditCancel = useCallback((): void => {
		setSelectedId(null);
		setDraft(null);
		setEditOriginalFsIds([]);
		setEditError(null);
		setSplitMode("fold-back");
	}, []);

	// ---------------------------------------------------------------------------
	// Save routing: ast-* → assistant route; others → /api/agents/:id
	// ---------------------------------------------------------------------------

	const handleEditSave = useCallback(async (): Promise<void> => {
		if (!(selectedId && draft)) return;
		setSaving(true);
		setEditError(null);

		try {
			let res: Response;

			if (selectedId.startsWith("ast-")) {
				// Assistant save route (persona + triple)
				// Extract userId from ast-{userId}
				const userId = selectedId.replace(/^ast-/, "");
				res = await apiFetch(`/api/users/${encodeURIComponent(userId)}/assistant`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: draft.name,
						systemPrompt: draft.systemPrompt || null,
						harnessType: draft.harnessType || null,
						modelId: draft.modelId || null,
						modelProvider: draft.modelProvider || null,
					}),
				});
			} else {
				// Normal agent save route
				res = await apiFetch(`/api/agents/${encodeURIComponent(selectedId)}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: draft.name,
						role: draft.role,
						systemPrompt: draft.systemPrompt || null,
						harnessType: draft.harnessType || null,
						modelId: draft.modelId || null,
						modelProvider: draft.modelProvider || null,
						maxConcurrentSessions: draft.maxConcurrentSessions,
					}),
				});
			}

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

			// AO1: persist filesystem injection changes
			const newIds = new Set(draft.filesystemIds);
			const origIds = new Set(editOriginalFsIds);
			const toAdd = draft.filesystemIds.filter((id) => !origIds.has(id));
			const toRemove = editOriginalFsIds.filter((id) => !newIds.has(id));
			await Promise.all([
				...toAdd.map((fsId) =>
					apiFetch(`/api/filesystems/${encodeURIComponent(fsId)}/injections`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ agentUserId: selectedId }),
					}),
				),
				...toRemove.map((fsId) =>
					apiFetch(
						`/api/filesystems/${encodeURIComponent(fsId)}/injections/${encodeURIComponent(selectedId)}`,
						{ method: "DELETE" },
					),
				),
			]);

			setAgents((prev) => prev.map((a) => (a.id === selectedId ? updated : a)));
			setSelectedId(null);
			setDraft(null);
			setEditOriginalFsIds([]);
			setSplitMode("fold-back");
			showToast("Agent saved");
		} catch {
			showToast("Failed to save agent");
		} finally {
			setSaving(false);
		}
	}, [selectedId, draft, editOriginalFsIds, showToast]);

	// ---------------------------------------------------------------------------
	// Add agent
	// ---------------------------------------------------------------------------

	const handleAddSave = useCallback(async (): Promise<void> => {
		setAdding(true);
		setAddError(null);
		try {
			const teamId = orgTeams.length > 0 ? (orgTeams[0]?.id ?? null) : null;
			const res = await apiFetch("/api/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: addDraft.name,
					role: addDraft.role,
					systemPrompt: addDraft.systemPrompt || null,
					harnessType: addDraft.harnessType || null,
					modelId: addDraft.modelId || null,
					modelProvider: addDraft.modelProvider || null,
					maxConcurrentSessions: addDraft.maxConcurrentSessions,
					teamId,
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
			setAddDraft({
				name: "",
				role: "builder",
				systemPrompt: "",
				harnessType: "",
				modelId: "",
				modelProvider: null,
				maxConcurrentSessions: 1,
				filesystemIds: [],
			});
			showToast("Agent created");
		} catch {
			showToast("Failed to create agent");
		} finally {
			setAdding(false);
		}
	}, [addDraft, orgTeams, showToast]);

	// ---------------------------------------------------------------------------
	// Delete
	// ---------------------------------------------------------------------------

	const handleDeleteFirstClick = useCallback((agentId: string): void => {
		if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current);
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
				if (selectedId === agentId) {
					setSelectedId(null);
					setDraft(null);
					setSplitMode("fold-back");
				}
				showToast("Agent deleted");
			} catch {
				showToast("Failed to delete agent");
			}
		},
		[selectedId, showToast],
	);

	// ---------------------------------------------------------------------------
	// Loading / error states
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

	// ---------------------------------------------------------------------------
	// Build the registered harness type set for availability checking
	// ---------------------------------------------------------------------------
	const registeredHarnessTypes = new Set(harnesses.map((h) => h.type));

	// ---------------------------------------------------------------------------
	// SplitView origin pane: agent list
	// ---------------------------------------------------------------------------

	const agentListOrigin = (
		<div className="flex flex-col gap-[9px]">
			<ItemList
				variant="flush"
				isEmpty={agents.length === 0}
				empty={{
					title: "No agents configured",
					description: "Add an agent to configure name, role, harness, model, and sessions.",
				}}
			>
				{/* AV2: No role filter — assistant (ast-*) appears as a row here. */}
				{agents.map((agent) => {
					const harnessUnavailable =
						agent.harnessType != null && !registeredHarnessTypes.has(agent.harnessType);
					const isSelected = selectedId === agent.id;

					return (
						<Row
							key={agent.id}
							as="div"
							title={
								<span className="flex items-center gap-[6px]">
									{agent.name}
									{harnessUnavailable && <StatusChip status="behind" label="Harness unavailable" />}
								</span>
							}
							subtitle={`${roleLabel(agent.role)} · ${harnesses.find((h) => h.type === agent.harnessType)?.name ?? agent.harnessType ?? "Default"} · ${activeRunCounts[agent.id] ?? 0} active`}
							selected={isSelected}
							actions={
								<div className="flex gap-[6px]">
									<Button
										variant="ghost"
										size="sm"
										aria-label={`Edit ${agent.name}`}
										onClick={(event) => {
											event.stopPropagation();
											void handleAgentClick(agent);
										}}
									>
										Edit
									</Button>
									{confirmingDeleteId === agent.id ? (
										<Button
											variant="ghost"
											size="sm"
											className="text-[var(--status-error)]"
											onClick={(e) => {
												e.stopPropagation();
												void handleDeleteConfirm(agent.id);
											}}
										>
											Confirm?
										</Button>
									) : (
										<Button
											variant="ghost"
											size="sm"
											className="text-[var(--status-error)]"
											aria-label={`Delete ${agent.name}`}
											onClick={(e) => {
												e.stopPropagation();
												handleDeleteFirstClick(agent.id);
											}}
										>
											Delete
										</Button>
									)}
								</div>
							}
						/>
					);
				})}
			</ItemList>

			<Button variant="ghost" size="sm" className="self-start" onClick={() => setAddMode(!addMode)}>
				{addMode ? "Cancel add" : "+ Add agent"}
			</Button>

			{addMode && (
				<div className="flex flex-col gap-[9px]">
					<AgentEditor
						agentId="new-agent"
						draft={addDraft}
						onDraftChange={(fn) => setAddDraft((prev) => fn(prev))}
						harnesses={harnesses}
						onSave={handleAddSave}
						onCancel={() => {
							setAddMode(false);
							setAddError(null);
						}}
						saving={adding}
						error={addError}
						fetchTemplateOnMount
						filesystems={filesystems}
					/>
				</div>
			)}
		</div>
	);

	// ---------------------------------------------------------------------------
	// SplitView destination pane: agent editor
	// ---------------------------------------------------------------------------

	const selectedAgent = agents.find((a) => a.id === selectedId);

	const agentEditorDestination =
		selectedId && draft ? (
			<AgentEditor
				agentId={selectedId}
				draft={draft}
				onDraftChange={(fn) => setDraft((prev) => (prev ? fn(prev) : prev))}
				harnesses={harnesses}
				onSave={handleEditSave}
				onCancel={handleEditCancel}
				saving={saving}
				error={editError}
				fetchTemplateOnMount
				filesystems={filesystems}
			/>
		) : (
			<EmptyState
				compact
				title="Select an agent"
				description="Click an agent row to edit its configuration."
			/>
		);

	// Suppress unused variable warning while keeping it for future use
	void selectedAgent;

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<SplitView
			surfaceKey="settings.agents"
			mode={splitMode}
			onModeChange={setSplitMode}
			dividerRatio={ratio}
			onRatioChange={setRatio}
			origin={agentListOrigin}
			destination={agentEditorDestination}
			compact={sidebarMobile}
			originLabel="agents"
		/>
	);
}
