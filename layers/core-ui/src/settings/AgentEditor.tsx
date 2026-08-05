/**
 * AV2 — AgentEditor: shared agent + assistant editor pane.
 *
 * A presentation component — it renders the edit form for any agent (including the
 * assistant, ast-* id). Save routing (assistant vs. agent endpoint) is the parent's
 * responsibility; the editor calls `onSave()` and lets the container decide.
 *
 * Key differences from the old inline renderEditForm:
 *  - Role field is `RoleCombobox` (catalog + custom free-text, NOT a closed Select).
 *  - Model select comes from `modelOptionsForHarness(selectedDescriptor)` — DISCOVERED
 *    models only, never MODEL_CATALOG. Empty discovered list → affordance text.
 *  - `fetchTemplateOnMount` prop: when true, fetches the template for the initial role
 *    on mount (used when editing an existing agent whose prompt was auto-filled).
 *  - Props are fully controlled: parent owns draft + sets it on changes.
 *
 * @lore AV2: AgentEditor is deliberately endpoint-agnostic. The ONLY structural
 * requirement from the architecture (§5a) is that ast-* save routing goes to the
 * assistant endpoint. That routing lives in SettingsAgents (the container), not here.
 * This separation keeps the editor pure and testable without mock routing logic.
 *
 * @lore AV2: RoleCombobox replaces the closed AGENT_ROLE_CATALOG Select so custom
 * roles survive round-trips without extra schema work (role is an open string).
 * The assistant's row keeps role="assistant" disabled (immutable).
 *
 * @lore AV2: The model dropdown source is descriptor.models (discovered at probe time),
 * NOT MODEL_CATALOG. An empty discovered list means the harness manages its own model
 * (e.g. codex) — the affordance text replaces the select in that case. This is the
 * founder concept-review blocking tweak: catalog fallback is NEVER used here.
 */

// hearth-internal-padding

import { Button, Input, RoleCombobox, Select } from "@hyperidle/design-system";
import type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
import { AGENT_ROLE_CATALOG } from "@hyperidle/shared";
import { type JSX, useEffect, useRef } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { modelOptionsForHarness } from "./model-options-for-harness.js";
import type { InjectableFilesystem } from "./settings-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The shape the parent maintains as draft state.
 * Mirrors the old EditFormValues plus modelProvider for the anti-422 guard.
 */
export interface AgentEditorDraft {
	name: string;
	role: string;
	systemPrompt: string;
	harnessType: string;
	modelId: string;
	/** AH2: current modelProvider selection — null when the harness doesn't surface providers. */
	modelProvider: string | null;
	maxConcurrentSessions: number;
	filesystemIds: string[];
}

export interface AgentEditorProps {
	/** The agent id being edited. ast-* → assistant route; others → /api/agents/:id */
	agentId: string;
	/** Controlled draft state. */
	draft: AgentEditorDraft;
	/** Called when the user changes any draft field. */
	onDraftChange: (fn: (prev: AgentEditorDraft) => AgentEditorDraft) => void;
	/**
	 * All harness descriptors (from GET /api/harnesses).
	 * The editor picks `selectedDescriptor = harnesses.find(h => h.type === draft.harnessType)`.
	 * Used to build the discovered model dropdown.
	 */
	harnesses: readonly HarnessCapabilityDescriptor[];
	/** Called when the user clicks Save. The parent handles the actual HTTP call. */
	onSave: () => void;
	/** Called when the user clicks Cancel or presses Escape. */
	onCancel: () => void;
	saving: boolean;
	/** Inline error (from 422 or save failure). */
	error: string | null;
	/**
	 * When true, fetches the role template on mount and pre-fills systemPrompt
	 * if empty. Used when editing an existing agent (role template for prompt hint).
	 */
	fetchTemplateOnMount?: boolean;
	/**
	 * AO1: the team's registered filesystems — pool for the per-bot injection control.
	 * Absent → the filesystem control is not rendered.
	 */
	filesystems?: InjectableFilesystem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_OPTIONS = AGENT_ROLE_CATALOG.map((e) => ({
	role: e.role,
	label: e.label,
	description: e.description,
}));

/** AO1: human label for a filesystem source — the easy-to-detect mark text. */
function fsSourceLabel(source: string): string {
	if (source === "github") return "GitHub";
	if (source === "gdrive") return "Google Drive";
	if (source === "obsidian") return "Obsidian";
	if (source === "local") return "Local";
	return source;
}

function reconcileModelProvider(
	descriptor: HarnessCapabilityDescriptor | undefined,
	currentProvider: string | null,
): string | null {
	const providers = descriptor?.modelProviders ?? [];
	if (providers.length === 0) return null;
	if (currentProvider && providers.includes(currentProvider)) return currentProvider;
	return providers[0] ?? null;
}

// ---------------------------------------------------------------------------
// AgentEditor
// ---------------------------------------------------------------------------

export function AgentEditor({
	agentId,
	draft,
	onDraftChange,
	harnesses,
	onSave,
	onCancel,
	saving,
	error,
	fetchTemplateOnMount,
	filesystems,
}: AgentEditorProps): JSX.Element {
	// Find the selected harness descriptor
	const selectedDescriptor = harnesses.find((h) => h.type === draft.harnessType);

	// Compute model options from the discovered descriptor.models
	const { hasModels, options: modelOptions } = selectedDescriptor
		? modelOptionsForHarness(selectedDescriptor)
		: { hasModels: false, options: [{ value: "", label: "System default" }] };

	// Harness select options
	const harnessOptions = [
		{ value: "", label: "Default" },
		...harnesses.map((h) => ({ value: h.type, label: h.name })),
	];

	// Template fetch on mount
	const templateFetchRef = useRef<AbortController | null>(null);

	useEffect(() => {
		if (!fetchTemplateOnMount) return;
		const controller = new AbortController();
		templateFetchRef.current = controller;
		void (async () => {
			try {
				const res = await apiFetch(`/api/agents/templates/${encodeURIComponent(draft.role)}`, {
					signal: controller.signal,
				});
				if (!res.ok) return;
				const json = (await res.json()) as { role: string; content: string };
				onDraftChange((prev) => ({
					...prev,
					systemPrompt: prev.systemPrompt || json.content,
				}));
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") return;
				// 404 (custom role with no template) → no-op, editor stays usable
			} finally {
				if (templateFetchRef.current === controller) {
					templateFetchRef.current = null;
				}
			}
		})();
		return () => {
			controller.abort();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [onDraftChange, fetchTemplateOnMount, draft.role]);

	const isAssistant = agentId.startsWith("ast-");

	return (
		<div className="flex flex-col gap-[12px] p-[12px] border border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
			<div className="flex gap-[9px] flex-wrap">
				{/* Name */}
				<div className="flex-1 min-w-[140px]">
					<Input
						id={`edit-name-${agentId}`}
						label="Name"
						type="text"
						value={draft.name}
						onChange={(e) => {
							onDraftChange((prev) => ({ ...prev, name: e.target.value }));
						}}
						aria-label="Name"
					/>
				</div>

				{/* Role — RoleCombobox (open string + catalog) */}
				<div className="flex-1 min-w-[140px]">
					<div className="flex flex-col gap-[3px]">
						<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
							Role
						</span>
						<RoleCombobox
							id={`edit-role-${agentId}`}
							options={ROLE_OPTIONS}
							value={draft.role}
							disabled={isAssistant} // assistant role is immutable
							onChange={(newRole) => {
								onDraftChange((prev) => ({ ...prev, role: newRole }));
							}}
						/>
					</div>
				</div>

				{/* Harness Select */}
				<div className="flex-1 min-w-[140px]">
					<Select
						id={`edit-harness-${agentId}`}
						label="Harness"
						size="sm"
						className="max-md:text-[16px]"
						value={draft.harnessType}
						onChange={(e) => {
							const newHarness = e.target.value;
							const newDescriptor = harnesses.find((h) => h.type === newHarness);
							const newModelProvider = reconcileModelProvider(newDescriptor, draft.modelProvider);
							onDraftChange((prev) => ({
								...prev,
								harnessType: newHarness,
								modelProvider: newModelProvider,
								// reset modelId when switching harnesses (stale ids cause 422)
								modelId: "",
							}));
						}}
						aria-label="Harness"
						options={harnessOptions}
					/>
				</div>

				{/* Model — discovered from descriptor.models */}
				<div className="flex-1 min-w-[140px]">
					{hasModels ? (
						<Select
							id={`edit-model-${agentId}`}
							label="Model"
							size="sm"
							className="max-md:text-[16px]"
							value={draft.modelId}
							onChange={(e) => {
								onDraftChange((prev) => ({ ...prev, modelId: e.target.value }));
							}}
							aria-label="Model"
							options={modelOptions}
						/>
					) : (
						<div className="flex flex-col gap-[3px]">
							<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
								Model
							</span>
							<p className="text-[12px] text-[var(--text-tertiary)]">
								This harness manages its own model selection.
							</p>
						</div>
					)}
				</div>

				{/* Max Sessions */}
				<div className="flex-1 min-w-[100px]">
					<div className="w-[88px]">
						<Input
							id={`edit-sessions-${agentId}`}
							label="Max Sessions"
							type="number"
							value={String(draft.maxConcurrentSessions)}
							min={1}
							max={20}
							onChange={(e) =>
								onDraftChange((prev) => ({
									...prev,
									maxConcurrentSessions: Number(e.target.value),
								}))
							}
							aria-label="Max Sessions"
						/>
					</div>
				</div>
			</div>

			{/* System prompt */}
			<Input
				id={`edit-system-prompt-${agentId}`}
				label="System prompt"
				textarea
				rows={8}
				value={draft.systemPrompt}
				onChange={(e) =>
					onDraftChange((prev) => ({
						...prev,
						systemPrompt: e.target.value,
					}))
				}
				placeholder="System prompt text (optional). Leave empty for no persona."
			/>

			{/* Filesystem injection — only when registry provided */}
			{filesystems && filesystems.length > 0 && (
				<div className="flex flex-col gap-[6px]">
					<span className="text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Filesystems
					</span>
					<div className="flex flex-col overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)]">
						{filesystems
							.filter((fs) => draft.filesystemIds.includes(fs.id))
							.map((fs, index) => (
								<div key={fs.id}>
									{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
									<div className="flex items-center gap-[9px] px-[9px] py-[6px]">
										<span className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[12px] text-[var(--text-primary)]">
											{`${fsSourceLabel(fs.source)} · ${fs.resource}`}
										</span>
										<Button
											variant="ghost"
											size="sm"
											aria-label={`Remove ${fs.resource} from this bot`}
											onClick={() =>
												onDraftChange((prev) => ({
													...prev,
													filesystemIds: prev.filesystemIds.filter((id) => id !== fs.id),
												}))
											}
										>
											Remove
										</Button>
									</div>
								</div>
							))}
					</div>
				</div>
			)}

			{/* Inline 422 error */}
			{error && (
				<p className="text-[12px] text-[var(--status-error)]" role="alert">
					{error}
				</p>
			)}

			{/* Actions */}
			<div className="flex gap-[9px] justify-end">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button variant="primary" size="sm" onClick={onSave} disabled={saving}>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}
