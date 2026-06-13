/**
 * AB3 — AgentEditDialog: soul-first edit dialog for a roster agent.
 *
 * Opens when `agent` is non-null. Closes when `agent` becomes null.
 *
 * Category-aware:
 * - Strategy agents: shows amber note, config fields disabled.
 * - Team/personal agents: no note, config fields enabled.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() to Dialog primitive.
 * isDirty tracks whether soulPrompt has changed from the initial value.
 * Authoring surface — guards on Esc when soul text is modified.
 */

// hearth-internal-padding
import { Avatar, Button, Dialog, Select } from "@hyperidle/design-system";
import type { RosterMember } from "@hyperidle/shared";
import { findRoleCatalogEntry, MODEL_TIERS } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import type { AgentConfig } from "../settings/settings-types.js";
import { useToast } from "../shell/ToastRegion.js";

export interface AgentEditDialogProps {
	/** Non-null = dialog open; null = dialog closed. */
	agent: AgentConfig | null;
	/** Roster context (name, role, category). */
	rosterMember: RosterMember | null;
	onClose: () => void;
	/** Called after successful save. Triggers refetch in parent. */
	onSaved: () => void;
}

interface EditFormValues {
	soulPrompt: string;
	harnessType: string;
	modelTierPreference: string;
	maxConcurrentSessions: number;
}

function agentToForm(agent: AgentConfig): EditFormValues {
	return {
		soulPrompt: agent.soulPrompt ?? "",
		harnessType: agent.harnessType ?? "",
		modelTierPreference: agent.modelTierPreference ?? "",
		maxConcurrentSessions: agent.maxConcurrentSessions,
	};
}

export function AgentEditDialog({
	agent,
	rosterMember,
	onClose,
	onSaved,
}: AgentEditDialogProps): JSX.Element {
	const { showToast } = useToast();
	const [formValues, setFormValues] = useState<EditFormValues>({
		soulPrompt: "",
		harnessType: "",
		modelTierPreference: "",
		maxConcurrentSessions: 1,
	});
	const [initialSoulPrompt, setInitialSoulPrompt] = useState("");
	const [configVisible, setConfigVisible] = useState(false);
	const [saving, setSaving] = useState(false);
	const [templateLoading, setTemplateLoading] = useState(false);
	const templateFetchAbortRef = useRef<AbortController | null>(null);

	const open = agent !== null;

	// Sync form when agent changes
	useEffect(() => {
		if (agent !== null) {
			const form = agentToForm(agent);
			setFormValues(form);
			setInitialSoulPrompt(form.soulPrompt);
			setConfigVisible(false);
		}
	}, [agent]);

	const isDirty = formValues.soulPrompt !== initialSoulPrompt;

	const handleSave = useCallback(async (): Promise<void> => {
		if (!agent) return;
		setSaving(true);
		try {
			const res = await apiFetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					soulPrompt: formValues.soulPrompt || null,
					harnessType: formValues.harnessType || null,
					modelTierPreference: formValues.modelTierPreference || null,
					maxConcurrentSessions: formValues.maxConcurrentSessions,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			onSaved();
			onClose();
			showToast("Agent saved");
		} catch {
			showToast("Failed to save agent");
		} finally {
			setSaving(false);
		}
	}, [agent, formValues, onSaved, onClose, showToast]);

	const handleLoadTemplate = useCallback(async (): Promise<void> => {
		if (!agent) return;
		if (templateFetchAbortRef.current) {
			templateFetchAbortRef.current.abort();
		}
		const controller = new AbortController();
		templateFetchAbortRef.current = controller;
		setTemplateLoading(true);
		try {
			const res = await apiFetch(`/api/agents/templates/${encodeURIComponent(agent.role)}`, {
				signal: controller.signal,
			});
			if (!res.ok) return;
			const json = (await res.json()) as { role: string; content: string };
			setFormValues((prev) => ({ ...prev, soulPrompt: json.content }));
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
		} finally {
			if (templateFetchAbortRef.current === controller) {
				templateFetchAbortRef.current = null;
			}
			setTemplateLoading(false);
		}
	}, [agent]);

	const role = rosterMember?.role ?? agent?.role ?? "";
	const catalogEntry = findRoleCatalogEntry(role);
	const roleLabel = catalogEntry?.label ?? role;
	const roleDescription = catalogEntry?.description ?? role;
	const isStrategy = (rosterMember?.agentCategory ?? agent?.agentCategory) === "strategy";
	const agentName = rosterMember?.name ?? agent?.name ?? "";
	const initials = agentName.slice(0, 2).toUpperCase();

	const showTemplateButton =
		!formValues.soulPrompt && catalogEntry?.hasTemplate === true && !templateLoading;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title={`Edit ${agentName}`}
			isDirty={isDirty}
			size="md"
			footer={
				<>
					<Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" type="button" onClick={handleSave} disabled={saving}>
						{saving && <span className="loading loading-spinner loading-xs" />}
						Save
					</Button>
				</>
			}
		>
			{/* Header */}
			<div className="flex items-start gap-[12px] mb-[18px]">
				<Avatar initials={initials} size="sm" agent />
				<div>
					<p className="text-[17px] font-semibold text-[var(--text-primary)] leading-tight">
						{agentName}
					</p>
					<p className="text-[13px] text-[var(--text-secondary)] mt-[3px]">{roleLabel}</p>
					<p className="text-[13px] text-[var(--text-secondary)] mt-[3px]">{roleDescription}</p>
				</div>
			</div>

			{/* Soul section */}
			<div className="mt-[18px]">
				<h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]">
					SOUL
				</h3>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
					Personality, style, and values. You define the soul; the system provides tools, context,
					and knowledge.
				</p>

				{isStrategy && (
					<div
						className="rounded-[var(--r-subtle)] p-[9px] mt-[6px] mb-[6px]"
						style={{ background: "rgba(217,119,6,0.06)" }}
					>
						<p className="text-[12px] text-[var(--text-secondary)]">
							This agent is managed by your strategy. Your soul edits are preserved, but operational
							configuration may be refreshed on strategy updates.
						</p>
					</div>
				)}

				<textarea
					aria-label="Soul Prompt"
					className="textarea textarea-bordered w-full mt-[6px]"
					rows={12}
					value={formValues.soulPrompt}
					onChange={(e) => setFormValues((prev) => ({ ...prev, soulPrompt: e.target.value }))}
					placeholder="Describe this agent's personality, communication style, and values..."
					disabled={saving}
				/>

				{showTemplateButton && (
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onClick={handleLoadTemplate}
						className="mt-[6px]"
					>
						Load {roleLabel} template
					</Button>
				)}
			</div>

			{/* Config section toggle */}
			<div className="mt-[12px]">
				<Button variant="ghost" size="sm" type="button" onClick={() => setConfigVisible((v) => !v)}>
					{isStrategy
						? configVisible
							? "Hide configuration (managed by strategy)"
							: "Show configuration (managed by strategy)"
						: configVisible
							? "Hide configuration"
							: "Show configuration"}
				</Button>

				{configVisible && (
					<div className="mt-[6px] flex flex-wrap gap-[12px]">
						<div className="form-control min-w-[140px] flex-1">
							<label className="label" htmlFor="edit-dialog-harness">
								<span className="label-text text-[var(--text-secondary)]">Harness</span>
							</label>
							<input
								id="edit-dialog-harness"
								type="text"
								aria-label="Harness"
								className="input input-sm input-bordered"
								value={formValues.harnessType}
								onChange={(e) =>
									setFormValues((prev) => ({ ...prev, harnessType: e.target.value }))
								}
								placeholder="e.g. claude-code"
								disabled={isStrategy || saving}
							/>
						</div>

						<div className="form-control min-w-[140px] flex-1">
							<label className="label" htmlFor="edit-dialog-tier">
								<span className="label-text text-[var(--text-secondary)]">Model tier</span>
							</label>
							<Select
								id="edit-dialog-tier"
								aria-label="Model tier"
								size="sm"
								value={formValues.modelTierPreference}
								onChange={(e) =>
									setFormValues((prev) => ({
										...prev,
										modelTierPreference: e.target.value,
									}))
								}
								disabled={isStrategy || saving}
								options={[
									{ value: "", label: "Default" },
									...MODEL_TIERS.map((t) => ({ value: t, label: t })),
								]}
							/>
						</div>

						<div className="form-control min-w-[100px] flex-1">
							<label className="label" htmlFor="edit-dialog-sessions">
								<span className="label-text text-[var(--text-secondary)]">Max sessions</span>
							</label>
							<input
								id="edit-dialog-sessions"
								type="number"
								aria-label="Max sessions"
								className="input input-sm input-bordered"
								value={formValues.maxConcurrentSessions}
								min={1}
								max={20}
								onChange={(e) =>
									setFormValues((prev) => ({
										...prev,
										maxConcurrentSessions: Number(e.target.value),
									}))
								}
								disabled={isStrategy || saving}
							/>
						</div>
					</div>
				)}
			</div>
		</Dialog>
	);
}

// AB3: no new design-system component — this is a page-level component.
// A .stories.tsx is not required per CLAUDE.md (stories required for design-system
// components). WorkTeam.stories.tsx covers the roster states visually.
