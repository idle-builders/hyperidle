import { HARNESS_TYPES, type HarnessType } from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
// hearth-internal-padding
import { Button, Combobox, Dialog, Input, KeyValue } from "../ds";
import { call } from "../services/call.js";
import { roleOptions } from "../settings/role-options.js";
import { useToast } from "../shell/ToastRegion.js";
import { roleLabel } from "../utils/role-label.js";

export interface AgentAddDialogProps {
	open: boolean;
	/** Name of the destination team — matched or created by `edit_user`'s `team` ref. Shown read-only above the name field. */
	teamName: string;
	onClose: () => void;
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
	role: "agent",
	systemPrompt: "",
	harnessType: "",
	maxConcurrentSessions: 1,
};

export function AgentAddDialog({
	open,
	teamName,
	onClose,
	onCreated,
	rolesInUse,
}: AgentAddDialogProps): JSX.Element {
	const { showToast } = useToast();
	const [formValues, setFormValues] = useState<AddFormValues>(INITIAL_FORM);
	const [creating, setCreating] = useState(false);

	useEffect(() => {
		if (open) {
			setFormValues(INITIAL_FORM);
		}
	}, [open]);

	const isDirty = formValues.name.trim().length > 0 || formValues.systemPrompt.trim().length > 0;

	const handleRoleChange = useCallback((newRole: string): void => {
		setFormValues((prev) => ({ ...prev, role: newRole, systemPrompt: "" }));
	}, []);

	const handleCreate = useCallback(async (): Promise<void> => {
		if (!formValues.name.trim()) return;
		setCreating(true);
		try {
			const harnessType = HARNESS_TYPES.includes(formValues.harnessType as HarnessType)
				? (formValues.harnessType as HarnessType)
				: undefined;
			const result = await call("edit_user", {
				kind: "ai",
				name: formValues.name.trim(),
				role: formValues.role,
				identity: formValues.systemPrompt || "",
				team: { name: teamName },
				runConfig: {
					...(harnessType ? { harnessType } : {}),
					maxConcurrentSessions: formValues.maxConcurrentSessions,
				},
			});
			if (!result.ok) throw new Error(result.problems[0]?.message ?? "Failed to create agent");
			onCreated();
			onClose();
			showToast("Agent created");
		} catch {
			showToast("Failed to create agent");
		} finally {
			setCreating(false);
		}
	}, [formValues, teamName, onCreated, onClose, showToast]);

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
			<div className="mb-[12px]">
				<KeyValue label="TEAM" value={teamName} layout="inline" />
			</div>

			<div className="flex flex-col gap-[12px]">
				<Input
					id="add-dialog-name"
					label="Agent name"
					type="text"
					placeholder="Agent name"
					value={formValues.name}
					onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
				/>
				<Combobox
					id="add-dialog-role"
					label="Role"
					options={roleOptions([...(rolesInUse ?? []), formValues.role])}
					value={formValues.role}
					allowCustomValue
					placeholder="Filter roles or type a new one…"
					listAriaLabel="Roles"
					inputAriaLabel="Filter or define a role"
					customValuePrefix="Use new role: "
					onChange={handleRoleChange}
				/>
				{roleDescription && (
					<p className="type-metadata  text-[var(--text-tertiary)]">{roleDescription}</p>
				)}
			</div>

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
