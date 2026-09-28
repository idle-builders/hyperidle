// hearth-internal-padding

import { HARNESS_TYPES, type HarnessType } from "@hyperidle/domain-model";
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
import { roleLabel } from "../utils/role-label.js";
import type { AgentEditorDraft } from "./AgentEditor.js";
import { AgentEditor } from "./AgentEditor.js";
import type { AgentConfig, InjectableFilesystem } from "./settings-types.js";

function agentToEditorDraft(agent: AgentConfig): AgentEditorDraft {
	return {
		name: agent.name,
		role: agent.role,
		systemPrompt: "",
		harnessType: agent.harnessType ?? "",
		modelId: agent.modelId ?? "",
		modelProvider: agent.modelProvider ?? null,
		maxConcurrentSessions: agent.maxConcurrentSessions,
		filesystemIds: agent.filesystemIds ?? [],
		modelOptions: agent.modelOptions ?? {},
	};
}

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

async function fetchActiveRunCounts(): Promise<Readonly<Record<string, number>>> {
	const result = await call("search_sessions", { state: "active", limit: 500 }).catch(() => null);
	if (!result?.ok) return {};
	const counts: Record<string, number> = {};
	for (const row of result.data) {
		counts[row.agentId] = (counts[row.agentId] ?? 0) + 1;
	}
	return counts;
}

export function SettingsAgents(): JSX.Element {
	const { showToast } = useToast();
	const [agents, setAgents] = useState<AgentConfig[]>([]);
	const [harnesses, setHarnesses] = useState<HarnessCapabilityDescriptor[]>([]);
	const [filesystems, setFilesystems] = useState<InjectableFilesystem[]>([]);
	const [activeRunCounts, setActiveRunCounts] = useState<Readonly<Record<string, number>>>({});
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

	const [splitMode, setSplitMode] = useState<FoldMode>("fold-back");
	const [ratio, setRatio] = useUiPreference("settings.agents", 0.42);
	const { sidebarMobile } = useViewportBreakpoint();

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState<AgentEditorDraft | null>(null);
	const [editOriginalFsIds, setEditOriginalFsIds] = useState<string[]>([]);
	const [editError, setEditError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

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
				{/* no role filter — the assistant appears as a row here */}
				{agents.map((agent) => {
					const isSelected = selectedId === agent.id;

					return (
						<Row
							key={agent.id}
							as="div"
							title={agent.name}
							subtitle={`${roleLabel(agent.role)} · ${harnesses.find((h) => h.type === agent.harnessType)?.name ?? agent.harnessType ?? "Default"} · ${activeRunCounts[agent.id] ?? 0} active`}
							selected={isSelected}
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
