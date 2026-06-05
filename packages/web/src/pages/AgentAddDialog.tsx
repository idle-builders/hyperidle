/**
 * AB3 — AgentAddDialog: create a new team agent.
 *
 * Separate from AgentEditDialog because the header is structurally different
 * (editable name + role select vs static identity display).
 *
 * @lore AB3: teamMembersId is explicitly named to prevent passing team.id
 * (the public team identifier) by mistake. users.teamId references
 * team_members.id, not teams.id. Passing team.id would fail the FK constraint.
 */

// hearth-internal-padding
import { Button } from "@hyperidle/design-system";
import { AGENT_ROLE_CATALOG, findRoleCatalogEntry, MODEL_TIERS } from "@hyperidle/shared";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

export interface AgentAddDialogProps {
	open: boolean;
	/** team_members.id — NOT teams.id. See @lore above. */
	teamMembersId: string;
	onClose: () => void;
	/** Called after successful create. Triggers refetch in parent. */
	onCreated: () => void;
}

interface AddFormValues {
	name: string;
	role: string;
	soulPrompt: string;
	harnessType: string;
	modelTierPreference: string;
	maxConcurrentSessions: number;
}

const INITIAL_FORM: AddFormValues = {
	name: "",
	role: "builder",
	soulPrompt: "",
	harnessType: "",
	modelTierPreference: "",
	maxConcurrentSessions: 1,
};

// Roles that can be added as team agents (category === "team")
const TEAM_ROLES = AGENT_ROLE_CATALOG.filter((e) => e.category === "team");

export function AgentAddDialog({
	open,
	teamMembersId,
	onClose,
	onCreated,
}: AgentAddDialogProps): JSX.Element {
	const { showToast } = useToast();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [formValues, setFormValues] = useState<AddFormValues>(INITIAL_FORM);
	const [creating, setCreating] = useState(false);
	const templateFetchAbortRef = useRef<AbortController | null>(null);

	// Open/close native dialog
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open) {
			setFormValues(INITIAL_FORM);
			if (!dialog.open) {
				dialog.showModal();
			}
		} else if (dialog.open) {
			dialog.close();
		}
	}, [open]);

	// Listen for native dialog close
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const handleClose = (): void => {
			onClose();
		};
		dialog.addEventListener("close", handleClose);
		return (): void => {
			dialog.removeEventListener("close", handleClose);
		};
	}, [onClose]);

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
			setFormValues((prev) => ({ ...prev, soulPrompt: json.content }));
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
			setFormValues((prev) => ({ ...prev, role: newRole, soulPrompt: "" }));
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
					soulPrompt: formValues.soulPrompt || null,
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
		<dialog
			ref={dialogRef}
			aria-label="Add agent"
			className="modal"
			style={{ maxWidth: "560px", width: "100%" }}
		>
			<div className="modal-box max-w-[560px] w-full bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[24px]">
				{/* Header — editable name + role select */}
				<div className="flex items-start justify-between gap-[12px] mb-[18px]">
					<div className="flex-1">
						<div className="form-control">
							<label className="label" htmlFor="add-dialog-name">
								<span className="label-text text-[var(--text-secondary)]">Agent name</span>
							</label>
							<input
								id="add-dialog-name"
								type="text"
								aria-label="Agent name"
								className="input input-sm input-bordered"
								placeholder="Agent name"
								value={formValues.name}
								onChange={(e) => setFormValues((prev) => ({ ...prev, name: e.target.value }))}
								autoFocus
							/>
						</div>
						<div className="form-control mt-[6px]">
							<label className="label" htmlFor="add-dialog-role">
								<span className="label-text text-[var(--text-secondary)]">Role</span>
							</label>
							<select
								id="add-dialog-role"
								aria-label="Role"
								className="select select-sm select-bordered"
								value={formValues.role}
								onChange={(e) => handleRoleChange(e.target.value)}
							>
								{TEAM_ROLES.map((entry) => (
									<option key={entry.role} value={entry.role}>
										{entry.label}
									</option>
								))}
							</select>
						</div>
						{roleDescription && (
							<p className="text-[12px] text-[var(--text-tertiary)] mt-[6px]">{roleDescription}</p>
						)}
					</div>
					<button
						type="button"
						aria-label="Close"
						className="btn btn-ghost btn-sm shrink-0"
						onClick={onClose}
					>
						✕
					</button>
				</div>

				{/* Soul section */}
				<div>
					<h3 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-[6px]">
						SOUL
					</h3>
					<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
						Personality, style, and values. You define the soul; the system provides tools, context,
						and knowledge.
					</p>
					<textarea
						aria-label="Soul Prompt"
						className="textarea textarea-bordered w-full mt-[6px]"
						rows={10}
						value={formValues.soulPrompt}
						onChange={(e) => setFormValues((prev) => ({ ...prev, soulPrompt: e.target.value }))}
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
								className="input input-sm input-bordered"
								value={formValues.harnessType}
								onChange={(e) =>
									setFormValues((prev) => ({ ...prev, harnessType: e.target.value }))
								}
								placeholder="e.g. claude-code"
								disabled={creating}
							/>
						</div>

						<div className="form-control min-w-[140px] flex-1">
							<label className="label" htmlFor="add-dialog-tier">
								<span className="label-text text-[var(--text-secondary)]">Model tier</span>
							</label>
							<select
								id="add-dialog-tier"
								aria-label="Model tier"
								className="select select-sm select-bordered"
								value={formValues.modelTierPreference}
								onChange={(e) =>
									setFormValues((prev) => ({
										...prev,
										modelTierPreference: e.target.value,
									}))
								}
								disabled={creating}
							>
								<option value="">Default</option>
								{MODEL_TIERS.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</select>
						</div>

						<div className="form-control min-w-[100px] flex-1">
							<label className="label" htmlFor="add-dialog-sessions">
								<span className="label-text text-[var(--text-secondary)]">Max sessions</span>
							</label>
							<input
								id="add-dialog-sessions"
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
								disabled={creating}
							/>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div
					className="flex justify-end gap-[6px] mt-[18px] pt-[12px]"
					style={{ borderTop: "1px solid var(--border-subtle)" }}
				>
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
				</div>
			</div>
			{/* Backdrop click closes dialog */}
			<form method="dialog" className="modal-backdrop">
				<button type="submit">close</button>
			</form>
		</dialog>
	);
}
