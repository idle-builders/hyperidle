/**
 * AB3 — AgentAddDialog: create a new team agent.
 *
 * Separate from AgentEditDialog because the header is structurally different
 * (editable name + role select vs static identity display).
 *
 * @lore AB3: teamMembersId is explicitly named to prevent passing team.id
 * (the public team identifier) by mistake. users.teamId references
 * team_members.id, not teams.id. Passing team.id would fail the FK constraint.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() boilerplate to the
 * Dialog primitive. isDirty is true when the user has modified name or systemPrompt
 * from the initial empty state. Authoring surface — guards on dismissal when dirty.
 */

// hearth-internal-padding
import { Button, Dialog, KeyValue, Select } from "@hyperidle/design-system";
import { AGENT_ROLE_CATALOG, findRoleCatalogEntry, MODEL_TIERS } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

export interface AgentAddDialogProps {
	open: boolean;
	/** team_members.id — NOT teams.id. See @lore above. */
	teamMembersId: string;
	/** Display name of the destination team. Shown read-only above the name field. */
	teamName: string;
	onClose: () => void;
	/** Called after successful create. Triggers refetch in parent. */
	onCreated: () => void;
}

interface AddFormValues {
	name: string;
	role: string;
	systemPrompt: string;
	harnessType: string;
	modelTierPreference: string;
	maxConcurrentSessions: number;
}

const INITIAL_FORM: AddFormValues = {
	name: "",
	role: "builder",
	systemPrompt: "",
	harnessType: "",
	modelTierPreference: "",
	maxConcurrentSessions: 1,
};

// Roles that can be added as team agents (category === "team")
const TEAM_ROLES = AGENT_ROLE_CATALOG.filter((e) => e.category === "team");

export function AgentAddDialog({
	open,
	teamMembersId,
	teamName,
	onClose,
	onCreated,
}: AgentAddDialogProps): JSX.Element {
	const { showToast } = useToast();
	const [formValues, setFormValues] = useState<AddFormValues>(INITIAL_FORM);
	const [creating, setCreating] = useState(false);
	const templateFetchAbortRef = useRef<AbortController | null>(null);

	// Reset form on open
	useEffect(() => {
		if (open) {
			setFormValues(INITIAL_FORM);
		}
	}, [open]);

	const isDirty = formValues.name.trim().length > 0 || formValues.systemPrompt.trim().length > 0;

	// Fetch template for the selected role (abort on rapid changes)
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
			setFormValues((prev) => ({ ...prev, systemPrompt: json.content }));
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
		} finally {
			if (templateFetchAbortRef.current === controller) {
				templateFetchAbortRef.current = null;
			}
		}
	}, []);

	const handleRoleChange = useCallback(
		(newRole: string): void => {
			setFormValues((prev) => ({ ...prev, role: newRole, systemPrompt: "" }));
			void fetchTemplate(newRole);
		},
		[fetchTemplate],
	);

	const handleCreate = useCallback(async (): Promise<void> => {
		if (!formValues.name.trim()) return;
		setCreating(true);
		try {
			const res = await apiFetch("/api/agents", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: formValues.name.trim(),
					role: formValues.role,
					systemPrompt: formValues.systemPrompt || null,
					harnessType: formValues.harnessType || null,
					modelTierPreference: formValues.modelTierPreference || null,
					maxConcurrentSessions: formValues.maxConcurrentSessions,
					teamId: teamMembersId,
				}),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			onCreated();
			onClose();
			showToast("Agent created");
		} catch {
			showToast("Failed to create agent");
		} finally {
			setCreating(false);
		}
	}, [formValues, teamMembersId, onCreated, onClose, showToast]);

	const selectedEntry = findRoleCatalogEntry(formValues.role);
	const roleDescription = selectedEntry?.description ?? formValues.role;

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Add agent"
			isDirty={isDirty}
			size="md"
			footer={
				<>
					<Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={creating}>
						Cancel
					</Button>
					<Button
						variant="primary"
						size="sm"
						type="button"
						onClick={handleCreate}
						disabled={creating || !formValues.name.trim()}
					>
						{creating && <span className="loading loading-spinner loading-xs" />}
						Create
					</Button>
				</>
			}
		>
			{/* AH4: placement context — read-only team name shown before identity fields */}
			<div className="mb-[12px]">
				<KeyValue label="TEAM" value={teamName} layout="inline" />
			</div>

			{/* Header — editable name + role select */}
			<div className="flex flex-col gap-[12px]">
				<div className="form-control">
					<label className="label" htmlFor="add-dialog-name">
						<span className="label-text text-[var(--text-secondary)]">Agent name</span>
					</label>
					<input
						id="add-dialog-name"
						type="text"
						aria-label="Agent name"
						className="input input-sm input-bordered w-full"
						placeholder="Agent name"
						value={formValues.name}
						onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
					/>
				</div>
				<div className="form-control">
					<label className="label" htmlFor="add-dialog-role">
						<span className="label-text text-[var(--text-secondary)]">Role</span>
					</label>
					<Select
						id="add-dialog-role"
						aria-label="Role"
						size="sm"
						value={formValues.role}
						onChange={(e) => handleRoleChange(e.target.value)}
						options={TEAM_ROLES.map((entry) => ({ value: entry.role, label: entry.label }))}
					/>
				</div>
				{roleDescription && (
					<p className="text-[12px] text-[var(--text-tertiary)]">{roleDescription}</p>
				)}
			</div>

			{/* System prompt section */}
			<div className="mt-[18px]">
				<h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]">
					SYSTEM PROMPT
				</h3>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
					Personality, style, and values. You define the system prompt; the harness provides tools,
					context, and knowledge.
				</p>
				<textarea
					aria-label="System prompt"
					className="textarea textarea-bordered w-full mt-[6px]"
					rows={10}
					value={formValues.systemPrompt}
					onChange={(e) => setFormValues((prev) => ({ ...prev, systemPrompt: e.target.value }))}
					placeholder="Describe this agent's personality, communication style, and values..."
					disabled={creating}
				/>
			</div>

			{/* Config section — starts expanded in create mode */}
			<div className="mt-[12px]">
				<h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]">
					CONFIGURATION
				</h3>
				<div className="flex flex-wrap gap-[12px]">
					<div className="form-control min-w-[140px] flex-1">
						<label className="label" htmlFor="add-dialog-harness">
							<span className="label-text text-[var(--text-secondary)]">Harness</span>
						</label>
						<input
							id="add-dialog-harness"
							type="text"
							aria-label="Harness"
							className="input input-sm input-bordered w-full"
							value={formValues.harnessType}
							onChange={(e) => setFormValues((prev) => ({ ...prev, harnessType: e.target.value }))}
							placeholder="e.g. claude-code"
							disabled={creating}
						/>
					</div>

					<div className="form-control min-w-[140px] flex-1">
						<label className="label" htmlFor="add-dialog-tier">
							<span className="label-text text-[var(--text-secondary)]">Model tier</span>
						</label>
						<Select
							id="add-dialog-tier"
							aria-label="Model tier"
							size="sm"
							value={formValues.modelTierPreference}
							onChange={(e) =>
								setFormValues((prev) => ({
									...prev,
									modelTierPreference: e.target.value,
								}))
							}
							disabled={creating}
							options={[
								{ value: "", label: "Default" },
								...MODEL_TIERS.map((t) => ({ value: t, label: t })),
							]}
						/>
					</div>

					<div className="form-control min-w-[100px] flex-1">
						<label className="label" htmlFor="add-dialog-sessions">
							<span className="label-text text-[var(--text-secondary)]">Max sessions</span>
						</label>
						<input
							id="add-dialog-sessions"
							type="number"
							aria-label="Max sessions"
							className="input input-sm input-bordered w-full"
							value={formValues.maxConcurrentSessions}
							min={1}
							max={20}
							onChange={(e) =>
								setFormValues((prev) => ({
									...prev,
									maxConcurrentSessions: Number(e.target.value),
								}))
							}
							disabled={creating}
						/>
					</div>
				</div>
			</div>
		</Dialog>
	);
}
