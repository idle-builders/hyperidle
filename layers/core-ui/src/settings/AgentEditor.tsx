// hearth-internal-padding

import type { HarnessCapabilityDescriptor } from "@hyperidle/harness-capability";
import type { JSX } from "react";
import { Link as RRLink } from "react-router-dom";
import { Button, Combobox, Input, SectionLabel, Select, Toggle } from "../ds";
import {
	declaredOptionsFor,
	defaultChoiceLabel,
	displayedValue,
	type ModelOptionValues,
	reconcileForModel,
	withOptionValue,
} from "./agent-model-options.js";
import { disciplineOptions } from "./discipline-options.js";
import { modelOptionsForHarness } from "./model-options-for-harness.js";
import type { InjectableFilesystem } from "./settings-types.js";

export interface AgentEditorDraft {
	name: string;
	/** The agent's craft. "" means unset — the combobox's empty value. */
	discipline: string;
	systemPrompt: string;
	harnessType: string;
	modelId: string;
	/** Current modelProvider selection — null when the harness doesn't surface providers. */
	modelProvider: string | null;
	maxConcurrentSessions: number;
	filesystemIds: string[];
	/**
	 * The options this agent's model runs with. Sparse — only what the user moved
	 * away from the harness's own default. See `agent-model-options.ts`.
	 */
	modelOptions: ModelOptionValues;
}

export interface AgentEditorProps {
	/** The agent id being edited. Every agent, assistants included, is edited through `edit_user`. */
	agentId: string;
	/** Controlled draft state. */
	draft: AgentEditorDraft;
	/** Called when the user changes any draft field. */
	onDraftChange: (fn: (prev: AgentEditorDraft) => AgentEditorDraft) => void;
	/**
	 * All harness descriptors (`open_user({}).runsOn` — install-wide, any user).
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
	 * The team's registered filesystems — pool for the per-bot injection control.
	 * Absent → the filesystem control is not rendered.
	 */
	filesystems?: InjectableFilesystem[];
	/**
	 * The agent's identity document, when it has one. Present → the editor links
	 * to it instead of offering a prompt box: the identity is a document, edited
	 * where documents are edited. Absent (creating an agent) → the box seeds it.
	 */
	identityDocumentId?: string | null;
	/**
	 * The disciplines agents actually have — what the picker offers.
	 *
	 * @lore: disciplinesInUse — a discipline is data, not a fixed list; typing one the list lacks introduces it.
	 */
	disciplinesInUse?: readonly string[];
}

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

export function AgentEditor({
	agentId,
	draft,
	onDraftChange,
	harnesses,
	onSave,
	onCancel,
	saving,
	error,
	filesystems,
	identityDocumentId,
	disciplinesInUse,
}: AgentEditorProps): JSX.Element {
	const selectedDescriptor = harnesses.find((h) => h.type === draft.harnessType);
	const declaredOptions = declaredOptionsFor(selectedDescriptor, draft.modelId);

	const { hasModels, options: modelOptions } = selectedDescriptor
		? modelOptionsForHarness(selectedDescriptor)
		: { hasModels: false, options: [{ value: "", label: "System default" }] };

	const harnessOptions = [
		{ value: "", label: "Default" },
		...harnesses.map((h) => ({ value: h.type, label: h.name })),
	];

	return (
		<div className="border-width-thin flex flex-col gap-[12px] p-[12px]  border-[var(--border-subtle)] rounded-[var(--r-subtle)]">
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

				{/* @lore: Combobox renders its own "Discipline" label internally — no extra label wrapper here. */}
				<div className="flex-1 min-w-[140px]">
					<Combobox
						id={`edit-discipline-${agentId}`}
						label="Discipline"
						options={disciplineOptions(
							disciplinesInUse ?? (draft.discipline ? [draft.discipline] : []),
						)}
						value={draft.discipline}
						allowCustomValue
						placeholder="Filter disciplines or type a new one…"
						listAriaLabel="Disciplines"
						inputAriaLabel="Filter or define a discipline"
						customValuePrefix="Use new discipline: "
						onChange={(newDiscipline) => {
							onDraftChange((prev) => ({ ...prev, discipline: newDiscipline }));
						}}
					/>
				</div>

				<div className="flex-1 min-w-[140px]">
					<Select
						id={`edit-harness-${agentId}`}
						label="Harness"
						size="sm"
						className="type-input "
						value={draft.harnessType}
						onChange={(e) => {
							const newHarness = e.target.value;
							const newDescriptor = harnesses.find((h) => h.type === newHarness);
							const newModelProvider = reconcileModelProvider(newDescriptor, draft.modelProvider);
							onDraftChange((prev) => ({
								...prev,
								harnessType: newHarness,
								modelProvider: newModelProvider,
								// A different harness declares different options; the old ones
								// cannot apply, and the model is being reset with them.
								modelOptions: {},
								// reset modelId when switching harnesses (stale ids cause 422)
								modelId: "",
							}));
						}}
						aria-label="Harness"
						options={harnessOptions}
					/>
				</div>

				<div className="flex-1 min-w-[140px]">
					{hasModels ? (
						<Select
							id={`edit-model-${agentId}`}
							label="Model"
							size="sm"
							className="type-input "
							value={draft.modelId}
							onChange={(e) => {
								const nextModelId = e.target.value;
								onDraftChange((prev) => ({
									...prev,
									modelId: nextModelId,
									// Keep only what the new model still declares and still offers.
									modelOptions: reconcileForModel(
										prev.modelOptions,
										declaredOptionsFor(selectedDescriptor, nextModelId),
									),
								}));
							}}
							aria-label="Model"
							options={modelOptions}
						/>
					) : (
						<div className="flex flex-col gap-[3px]">
							<span className="type-label   uppercase  text-[var(--text-tertiary)]">Model</span>
							<p className="type-metadata  text-[var(--text-tertiary)]">
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

			{/* model options — only renders when selected model declares any */}
			{declaredOptions.length > 0 && (
				<div className="flex flex-col gap-[6px]">
					<SectionLabel label="Model options" />
					<p className="type-metadata text-[var(--text-tertiary)]">
						Applied to every run of this agent.
					</p>
					<div className="flex flex-wrap gap-[12px]">
						{declaredOptions.map((option) => {
							const value = displayedValue(option, draft.modelOptions);
							const setValue = (next: string | number | boolean | undefined): void => {
								onDraftChange((prev) => ({
									...prev,
									modelOptions: withOptionValue(prev.modelOptions, option, next),
								}));
							};

							if (option.control.kind === "boolean") {
								return (
									<Toggle
										key={option.key}
										label={option.label}
										{...(option.helpText ? { description: option.helpText } : {})}
										on={value === true}
										onChange={(on) => setValue(on)}
									/>
								);
							}

							if (option.control.kind === "select") {
								const choices = option.control.choices.map((choice) => ({
									value: choice.value,
									label: choice.label,
								}));
								return (
									<div key={option.key} className="flex-1 min-w-[140px]">
										<Select
											id={`edit-option-${option.key}-${agentId}`}
											label={option.label}
											size="sm"
											className="type-input"
											value={value === undefined ? "" : String(value)}
											onChange={(e) => setValue(e.target.value)}
											aria-label={option.label}
											options={
												option.required
													? choices
													: [{ value: "", label: defaultChoiceLabel(option) }, ...choices]
											}
										/>
									</div>
								);
							}

							const isNumber = option.control.kind === "number";
							return (
								<div key={option.key} className="flex-1 min-w-[140px]">
									<Input
										id={`edit-option-${option.key}-${agentId}`}
										label={option.label}
										type={isNumber ? "number" : "text"}
										value={option.key in draft.modelOptions ? String(value ?? "") : ""}
										placeholder={
											option.defaultValue === undefined ? undefined : String(option.defaultValue)
										}
										onChange={(e) => {
											const raw = e.target.value;
											if (raw === "") return setValue(undefined);
											return setValue(isNumber ? Number(raw) : raw);
										}}
										aria-label={option.label}
									/>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* identity — links to document if one exists; inline editor otherwise */}
			{identityDocumentId ? (
				<div className="flex flex-col gap-[6px]">
					<span className="type-label   uppercase  text-[var(--text-tertiary)]">Identity</span>
					<RRLink
						to={`/documents/${identityDocumentId}`}
						data-testid={`edit-identity-link-${agentId}`}
						className="type-metadata  text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
					>
						Edit identity document
					</RRLink>
				</div>
			) : (
				<Input
					id={`edit-system-prompt-${agentId}`}
					label="Identity"
					textarea
					rows={8}
					value={draft.systemPrompt}
					onChange={(e) =>
						onDraftChange((prev) => ({
							...prev,
							systemPrompt: e.target.value,
						}))
					}
					placeholder="Who this agent is (optional). Becomes its identity document."
				/>
			)}

			{/* filesystem injection — only when registry provided */}
			{filesystems && filesystems.length > 0 && (
				<div className="flex flex-col gap-[6px]">
					<span className="type-label   uppercase  text-[var(--text-tertiary)]">Filesystems</span>
					<div className="border-width-thin flex flex-col overflow-hidden rounded-[var(--r-subtle)]  border-[var(--border-subtle)]">
						{filesystems
							.filter((fs) => draft.filesystemIds.includes(fs.id))
							.map((fs, index) => (
								<div key={fs.id}>
									{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
									<div className="flex items-center gap-[9px] px-[9px] py-[6px]">
										<span className="type-data min-w-0 flex-1 truncate   text-[var(--text-primary)]">
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

			{/* inline error */}
			{error && (
				<p className="type-metadata  text-[var(--status-error)]" role="alert">
					{error}
				</p>
			)}

			{/* actions */}
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
