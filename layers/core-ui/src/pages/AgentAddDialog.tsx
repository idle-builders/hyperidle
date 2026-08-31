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

import { roleLabel } from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
// hearth-internal-padding
import { Button, Dialog, Input, KeyValue, Select } from "../ds";
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
	/** The roles agents actually have — what the picker offers. A new one introduces itself. */
	rolesInUse?: readonly string[];
}

interface AddFormValues {
	name: string;
	role: string;
	systemPrompt: string;
	harnessType: string;
	maxConcurrentSessions: number;
}

const INITIAL_FORM: AddFormValues = {
	name: "",
	role: "builder",
	systemPrompt: "",
	harnessType: "",
	maxConcurrentSessions: 1,
};

/**
 * @lore BA9g: this was `AGENT_ROLE_CATALOG.filter(category === "team")` behind a
 * closed <Select> — you could only add an agent in one of 15 roles the product
 * had decided on. A role is data now: the picker offers the roles the team's
 * agents actually have, and typing a new one introduces it.
 */

export function AgentAddDialog({
	open,
	teamMembersId,
	teamName,
	onClose,
	onCreated,
	rolesInUse,
}: AgentAddDialogProps): JSX.Element {
	const { showToast } = useToast();
	const [formValues, setFormValues] = useState<AddFormValues>(INITIAL_FORM);
	const [creating, setCreating] = useState(false);

	// Reset form on open
	useEffect(() => {
		if (open) {
			setFormValues(INITIAL_FORM);
		}
	}, [open]);

	const isDirty = formValues.name.trim().length > 0 || formValues.systemPrompt.trim().length > 0;

	// @lore BA9g: prefilling a new agent's identity from the role's template is
	// gone with the route and the files behind it. The personas belong to the
	// `role-personas` plugin; a new agent starts with an empty identity.

	const handleRoleChange = useCallback((newRole: string): void => {
		setFormValues((prev) => ({ ...prev, role: newRole, systemPrompt: "" }));
	}, []);

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

	const roleDescription = roleLabel(formValues.role);

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
				<Input
					id="add-dialog-name"
					label="Agent name"
					type="text"
					placeholder="Agent name"
					value={formValues.name}
					onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
				/>
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
						options={[...new Set([...(rolesInUse ?? []), formValues.role])]
							.filter((role) => role.length > 0)
							.sort()
							.map((role) => ({ value: role, label: roleLabel(role) }))}
					/>
				</div>
				{roleDescription && (
					<p className="type-metadata  text-[var(--text-tertiary)]">{roleDescription}</p>
				)}
			</div>

			{/* System prompt section */}
			<div className="mt-[18px]">
				<h3 className="type-label   uppercase  text-[var(--text-tertiary)] mb-[6px]">
					System prompt
				</h3>
				<p className="type-metadata  text-[var(--text-tertiary)] mb-[6px]">
					Personality, style, and values. You define the system prompt; the harness provides tools,
					context, and knowledge.
				</p>
				<Input
					textarea
					aria-label="System prompt"
					className="mt-[6px]"
					rows={10}
					value={formValues.systemPrompt}
					onChange={(e) => setFormValues((prev) => ({ ...prev, systemPrompt: e.target.value }))}
					placeholder="Describe this agent's personality, communication style, and values..."
					disabled={creating}
				/>
			</div>

			{/* Config section — starts expanded in create mode */}
			<div className="mt-[12px]">
				<h3 className="type-label   uppercase  text-[var(--text-tertiary)] mb-[6px]">
					CONFIGURATION
				</h3>
				<div className="flex flex-wrap gap-[12px]">
					<div className="min-w-[140px] flex-1">
						<Input
							id="add-dialog-harness"
							label="Harness"
							type="text"
							value={formValues.harnessType}
							onChange={(e) => setFormValues((prev) => ({ ...prev, harnessType: e.target.value }))}
							placeholder="e.g. claude-code"
							disabled={creating}
						/>
					</div>

					<div className="min-w-[100px] flex-1">
						<Input
							id="add-dialog-sessions"
							label="Max sessions"
							type="number"
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
