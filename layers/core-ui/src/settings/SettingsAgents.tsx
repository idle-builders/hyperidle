/**
 * SettingsAgents — Agent Configuration settings section.
 *
 * AV2: Rewritten to use SplitView + ItemList/Row. Key changes:
 *  - Remove `role !== "assistant"` filter — assistant is now a row in the list.
 *  - Use AgentEditor (shared editor) in the SplitView destination pane.
 *  - Model dropdown reads descriptor.models (discovered), NOT MODEL_CATALOG.
 *  - SplitView ratio persisted via useUiPreference("settings.agents", 0.42).
 *  - Save routing: `edit_user`, for every agent including assistants.
 *
 * @lore AV2: The assistant (ast-*) was previously filtered out of this list and
 * managed in SettingsAssistant. AV2 unifies: the assistant IS an agent. The row
 * filter at :753 is removed; SettingsAssistant.tsx is deleted.
 *
 * @lore AV2: Model options now come from descriptor.models (discovered at probe time
 * by the per-harness CLI probes), NOT from MODEL_CATALOG.
 * This is the founder concept-review blocking tweak. modelOptionsForHarness() is the
 * single source of truth for options.
 *
 * @lore AV2: SplitView ratio persistence requires wiring
 * const [ratio, setRatio] = useUiPreference(key, default)
 * then dividerRatio={ratio} onRatioChange={setRatio} — surfaceKey alone is
 * presentational/informational only (SplitView.tsx:46 @lore AM5 T6).
 *
 * @lore BC5 T9: the door swap — `search_users({ kind: "ai" })` replaces `GET
 * /api/agents`; one `open_user({ id })` per row (parallel) replaces the
 * per-row `GET /api/filesystems?agentUserId=` fetch and carries the full
 * editor draft (harness/model/identity/folders) up front, so opening a row
 * no longer needs a second fetch. `edit_user` replaces the agent PATCH/POST/
 * DELETE routes: a save is a patch by id, a create passes `kind:"ai"` and
 * `identity: systemPrompt ?? ""` always (so the agent gets an identity
 * document even from an empty box, matching the old route), and a delete is
 * `status:"retired"` — there is no hard agent delete any more. Filesystem
 * injection is `folders.give`/`folders.take` on the same call, so the two
 * separate `POST/DELETE .../injections` round trips collapse into the save.
 * The install-wide harness list and the caller's team folders both come off
 * one `open_user({})` (self) call — `runsOn` is install-wide regardless of
 * whose row you open, and a person's `folders` are their team's registered
 * ones (the injection pool). A new agent's team defaults to the caller's
 * (`open_user({}).user.team`) — this screen has no team picker of its own.
 */

// hearth-internal-padding

import { HARNESS_TYPES, type HarnessType } from "@hyperidle/domain-model";
import { roleLabel } from "../utils/role-label.js";
import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import { type JSX, useCallback, useEffect, useState } from "react";
import type { FoldMode } from "../ds";
import {
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	Row,
	RowDeleteAction,
	SkeletonList,
	SplitView,
} from "../ds";
import { useUiPreference } from "../hooks/useUiPreference.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { call } from "../services/call.js";
import { useToast } from "../shell/ToastRegion.js";
import type { AgentEditorDraft } from "./AgentEditor.js";
import { AgentEditor } from "./AgentEditor.js";
import type { AgentConfig, InjectableFilesystem } from "./settings-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentToEditorDraft(agent: AgentConfig): AgentEditorDraft {
	return {
		name: agent.name,
		role: agent.role,
		// The identity is a document; the draft only seeds one when creating.
		systemPrompt: "",
		harnessType: agent.harnessType ?? "",
		modelId: agent.modelId ?? "",
		modelProvider: agent.modelProvider ?? null,
		maxConcurrentSessions: agent.maxConcurrentSessions,
		filesystemIds: agent.filesystemIds ?? [],
		modelOptions: agent.modelOptions ?? {},
	};
}

/** A team folder as `open_user` carries it, shaped for the injection control. */
function folderToInjectable(folder: {
	id: string;
	source: string;
	kind: string;
	resourceRef: { kind: string; repo?: string; branch?: string; folder?: string };
}): InjectableFilesystem {
	const ref = folder.resourceRef;
	const resource =
		ref.kind === "code"
			? `${ref.repo ?? ""}${ref.branch ? `@${ref.branch}` : ""}`
			: (ref.folder ?? "");
	return { id: folder.id, source: folder.source, kind: folder.kind, resource };
}

/**
 * Active session counts keyed by agent id, degrading to "0 active" on any
 * failure — the agent list is core's data and stands on its own.
 *
 * @lore `search_sessions` defaults to 100 with no `limit` set; the old
 * route had no cap at all. 500 (the action's max) is the closest this read
 * can get to "every active session" under the new contract.
 */
async function fetchActiveRunCounts(): Promise<Readonly<Record<string, number>>> {
	const result = await call("search_sessions", { state: "active", limit: 500 }).catch(() => null);
	if (!result?.ok) return {};
	const counts: Record<string, number> = {};
	for (const row of result.data) {
		counts[row.agentId] = (counts[row.agentId] ?? 0) + 1;
	}
	return counts;
}

// ---------------------------------------------------------------------------
// SettingsAgents
// ---------------------------------------------------------------------------

export function SettingsAgents(): JSX.Element {
	const { showToast } = useToast();
	const [agents, setAgents] = useState<AgentConfig[]>([]);
	const [harnesses, setHarnesses] = useState<HarnessCapabilityDescriptor[]>([]);
	const [filesystems, setFilesystems] = useState<InjectableFilesystem[]>([]);
	/**
	 * @lore AU26 J4: the "N active" count per agent used to ride on
	 * `GET /api/agents` (and on both PATCH responses, purely so the client could
	 * splice it back into the list row). Core-api no longer reads sessions.
	 * Keeping it in its own state also removes the splice problem outright — a
	 * save no longer has to carry a run count.
	 *
	 * @lore `GET /api/agent-orchestration/runs/active-counts` is deleted;
	 * this map is now counted client-side from `search_sessions({ state:
	 * "active" })` rows.
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
		role: "agent",
		systemPrompt: "",
		harnessType: "",
		modelId: "",
		modelProvider: null,
		maxConcurrentSessions: 1,
		filesystemIds: [],
		modelOptions: {},
	});
	/** The caller's own team — a new agent defaults to it; this screen has no team picker. */
	const [selfTeamName, setSelfTeamName] = useState<string | null>(null);

	// ---------------------------------------------------------------------------
	// Data loading
	// ---------------------------------------------------------------------------

	const loadAgents = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const [selfResult, listResult] = await Promise.all([
				call("open_user", {}),
				call("search_users", { kind: "ai" }),
			]);
			if (!listResult.ok)
				throw new Error(listResult.problems[0]?.message ?? "Failed to load agents");

			if (selfResult.ok) {
				setHarnesses([...selfResult.data.runsOn]);
				setFilesystems(selfResult.data.folders.map(folderToInjectable));
				setSelfTeamName(selfResult.data.user?.team?.name ?? null);
			}

			// Active session counts from search_sessions. A failure here must
			// not fail the page — the agent list is core's data and stands on its
			// own; the counts simply render as 0.
			const countsPromise = fetchActiveRunCounts();

			const views = await Promise.all(
				listResult.data.map((row) => call("open_user", { id: row.id })),
			);
			const agentConfigs: AgentConfig[] = listResult.data.map((row, index) => {
				const view = views[index];
				const identityDocumentId = view?.ok
					? (view.data.documentIds.find((d) => d.slot === "agent_file")?.id ?? null)
					: null;
				return {
					id: row.id,
					name: row.name,
					role: row.role,
					ownerUserId: row.ownerUserId,
					identityDocumentId,
					harnessType: view?.ok ? (view.data.runConfig?.harnessType ?? null) : null,
					modelId: view?.ok ? (view.data.runConfig?.modelId ?? null) : null,
					modelProvider: view?.ok ? (view.data.runConfig?.modelProvider ?? null) : null,
					maxConcurrentSessions: view?.ok ? (view.data.runConfig?.maxConcurrentSessions ?? 1) : 1,
					status: row.status,
					agentCategory: row.agentCategory,
					filesystemIds: view?.ok ? view.data.folders.map((f) => f.id) : [],
					modelOptions: view?.ok ? (view.data.runConfig?.modelOptions ?? {}) : {},
				};
			});
			setAgents(agentConfigs);
			setActiveRunCounts(await countsPromise);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void loadAgents();
	}, [loadAgents]);

	// ---------------------------------------------------------------------------
	// Agent row click → open editor
	// ---------------------------------------------------------------------------

	const handleAgentClick = useCallback((agent: AgentConfig): void => {
		setEditError(null);
		setAddMode(false);
		setEditOriginalFsIds(agent.filesystemIds ?? []);
		setDraft(agentToEditorDraft(agent));
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
	// Save: `edit_user`, for every agent including the assistant
	// ---------------------------------------------------------------------------

	const handleEditSave = useCallback(async (): Promise<void> => {
		if (!(selectedId && draft)) return;
		setSaving(true);
		setEditError(null);

		try {
			const newIds = new Set(draft.filesystemIds);
			const origIds = new Set(editOriginalFsIds);
			const give = draft.filesystemIds.filter((id) => !origIds.has(id));
			const take = editOriginalFsIds.filter((id) => !newIds.has(id));
			const harnessType = HARNESS_TYPES.includes(draft.harnessType as HarnessType)
				? (draft.harnessType as HarnessType)
				: undefined;

			// One action for every agent. The id-prefix split existed because the
			// persona was a column with an assistant-shaped guard on it; both the
			// guard and the second route are gone.
			const result = await call("edit_user", {
				id: selectedId,
				name: draft.name,
				role: draft.role,
				runConfig: {
					...(harnessType ? { harnessType } : {}),
					...(draft.modelId ? { modelId: draft.modelId } : {}),
					...(draft.modelProvider ? { modelProvider: draft.modelProvider } : {}),
					maxConcurrentSessions: draft.maxConcurrentSessions,
					modelOptions: draft.modelOptions,
				},
				...(give.length > 0 || take.length > 0 ? { folders: { give, take } } : {}),
			});

			if (!result.ok) {
				setEditError(result.problems[0]?.message ?? "Server rejected the changes.");
				return;
			}

			setAgents((prev) =>
				prev.map((a) =>
					a.id === selectedId
						? {
								...a,
								name: draft.name,
								role: draft.role,
								harnessType: draft.harnessType || null,
								modelId: draft.modelId || null,
								modelProvider: draft.modelProvider,
								maxConcurrentSessions: draft.maxConcurrentSessions,
								modelOptions: draft.modelOptions,
								filesystemIds: draft.filesystemIds,
							}
						: a,
				),
			);
			setSelectedId(null);
			setDraft(null);
			setEditOriginalFsIds([]);
			setSplitMode("fold-back");
			showToast("Agent saved");
			void loadAgents();
		} catch {
			showToast("Failed to save agent");
		} finally {
			setSaving(false);
		}
	}, [selectedId, draft, editOriginalFsIds, showToast, loadAgents]);

	// ---------------------------------------------------------------------------
	// Add agent
	// ---------------------------------------------------------------------------

	const handleAddSave = useCallback(async (): Promise<void> => {
		setAdding(true);
		setAddError(null);
		try {
			const harnessType = HARNESS_TYPES.includes(addDraft.harnessType as HarnessType)
				? (addDraft.harnessType as HarnessType)
				: undefined;
			const result = await call("edit_user", {
				kind: "ai",
				name: addDraft.name,
				role: addDraft.role,
				identity: addDraft.systemPrompt || "",
				...(selfTeamName ? { team: { name: selfTeamName } } : {}),
				runConfig: {
					...(harnessType ? { harnessType } : {}),
					maxConcurrentSessions: addDraft.maxConcurrentSessions,
					modelOptions: addDraft.modelOptions,
				},
			});
			if (!result.ok) {
				setAddError(result.problems[0]?.message ?? "Server rejected the changes.");
				return;
			}
			setAddMode(false);
			setAddDraft({
				name: "",
				role: "agent",
				systemPrompt: "",
				harnessType: "",
				modelId: "",
				modelProvider: null,
				maxConcurrentSessions: 1,
				filesystemIds: [],
				modelOptions: {},
			});
			showToast("Agent created");
			void loadAgents();
		} catch {
			showToast("Failed to create agent");
		} finally {
			setAdding(false);
		}
	}, [addDraft, selfTeamName, showToast, loadAgents]);

	// ---------------------------------------------------------------------------
	// Delete — soft: status "retired". There is no hard agent delete any more.
	// ---------------------------------------------------------------------------

	const handleDeleteConfirm = useCallback(
		async (agentId: string): Promise<void> => {
			try {
				const result = await call("edit_user", { id: agentId, status: "retired" });
				if (!result.ok) throw new Error(result.problems[0]?.message ?? "Failed to delete agent");
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
				{/* No role filter — the assistant appears as a row here. */}
				{agents.map((agent) => {
					const isSelected = selectedId === agent.id;

					return (
						<Row
							key={agent.id}
							as="div"
							title={agent.name}
							subtitle={`${roleLabel(agent.role)} · ${harnesses.find((h) => h.type === agent.harnessType)?.name ?? agent.harnessType ?? "Default"} · ${activeRunCounts[agent.id] ?? 0} active`}
							selected={isSelected}
							// @lore FR-10: destructive delete moved behind Menu, via the shared
							// RowDeleteAction (kebab → Menu → inline confirm/cancel). The
							// person-owned agent (the assistant) gets no onDelete — BC3: identity
							// is `ownerUserId`, not a structural id prefix. RowDeleteAction
							// then renders the same kebab+Menu chrome with only "Edit", no
							// destructive item and no confirm step.
							actions={
								<RowDeleteAction
									triggerLabel={`Actions for ${agent.name}`}
									menuLabel="Agent actions"
									items={[
										{ id: "edit", label: "Edit", onSelect: () => void handleAgentClick(agent) },
									]}
									onDelete={
										(agent.ownerUserId ?? null) !== null
											? undefined
											: () => handleDeleteConfirm(agent.id)
									}
								/>
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
						ownerUserId={null}
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
						filesystems={filesystems}
						rolesInUse={agents.map((a) => a.role)}
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
				ownerUserId={selectedAgent?.ownerUserId ?? null}
				draft={draft}
				onDraftChange={(fn) => setDraft((prev) => (prev ? fn(prev) : prev))}
				harnesses={harnesses}
				onSave={handleEditSave}
				onCancel={handleEditCancel}
				saving={saving}
				error={editError}
				filesystems={filesystems}
				identityDocumentId={selectedAgent?.identityDocumentId ?? null}
				rolesInUse={agents.map((a) => a.role)}
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
