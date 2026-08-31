/**
 * AV4 — AgentDetailPane: AgentEditDialog body lifted into a plain pane.
 *
 * The <Dialog> shell is STRIPPED — no role="dialog" is emitted anywhere (AC#3).
 * Save logic is unchanged (PATCH /api/agents/:id). Template load unchanged.
 * This is the body of AgentEditDialog, not a fork — logic must stay in sync.
 *
 * @lore AV4: Dialog shell stripped per plan §2.4. The pane renders only the body
 * + a plain (non-Dialog) header. Tests assert no role="dialog" in the tree.
 * If AgentEditDialog body diverges (new fields, new logic), this pane MUST follow.
 * A parallel copy that drifts is a CRITICAL review finding.
 */

import type { RosterMember } from "@hyperidle/domain-model";
import { roleLabel as deriveRoleLabel } from "@hyperidle/domain-model";
import { type JSX, useCallback, useEffect, useState } from "react";
import { Link as RRLink } from "react-router-dom";
// hearth-internal-padding
import { Avatar, Button, Input, PageHeader, PageScaffold } from "../../ds";
import { apiFetch } from "../../services/api-fetch.js";
import type { AgentConfig } from "../../settings/settings-types.js";
import { useToast } from "../../shell/ToastRegion.js";
import { deriveInitials } from "../../utils/initials.js";

export interface AgentDetailPaneProps {
	/** Non-null = display this agent; null = empty state. */
	agent: AgentConfig | null;
	/** Roster context (name, role, category). */
	rosterMember: RosterMember | null;
	onClose: () => void;
	/** Called after successful save. Triggers refetch in parent. */
	onSaved: () => void;
}

interface EditFormValues {
	harnessType: string;
	maxConcurrentSessions: number;
}

function agentToForm(agent: AgentConfig): EditFormValues {
	return {
		harnessType: agent.harnessType ?? "",
		maxConcurrentSessions: agent.maxConcurrentSessions,
	};
}

export function AgentDetailPane({
	agent,
	rosterMember,
	onClose,
	onSaved,
}: AgentDetailPaneProps): JSX.Element {
	const { showToast } = useToast();
	const [formValues, setFormValues] = useState<EditFormValues>({
		harnessType: "",
		maxConcurrentSessions: 1,
	});
	const [initialForm, setInitialForm] = useState<EditFormValues>({
		harnessType: "",
		maxConcurrentSessions: 1,
	});
	const [configVisible, setConfigVisible] = useState(false);
	const [saving, setSaving] = useState(false);

	// Sync form when agent changes
	useEffect(() => {
		if (agent !== null) {
			const form = agentToForm(agent);
			setFormValues(form);
			setInitialForm(form);
			setConfigVisible(false);
		}
	}, [agent]);

	const isDirty =
		formValues.harnessType !== initialForm.harnessType ||
		formValues.maxConcurrentSessions !== initialForm.maxConcurrentSessions;

	const handleSave = useCallback(async (): Promise<void> => {
		if (!agent) return;
		setSaving(true);
		try {
			const res = await apiFetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					harnessType: formValues.harnessType || null,
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

	const role = rosterMember?.role ?? agent?.role ?? "";
	const roleLabel = deriveRoleLabel(role);
	// @lore BA9g: the catalog's description went with the catalog — an agent's
	// identity document says what it is for, not a sentence about its role.
	const roleDescription = roleLabel;
	// @lore BA9d D5: strategy category removed — isStrategy deleted.
	const agentName = rosterMember?.name ?? agent?.name ?? "";
	const initials = deriveInitials(agentName);

	if (agent === null) {
		return (
			<PageScaffold>
				<div className="type-small flex h-full items-center justify-center p-[24px] text-[var(--text-tertiary)] ">
					No agent selected
				</div>
			</PageScaffold>
		);
	}

	return (
		<PageScaffold
			// Note: NO <Dialog> shell — no role="dialog" (AC#3 requirement).
			data-testid="agent-detail-pane"
			header={
				<PageHeader
					presentation="pane"
					reservePaneControls
					title={agentName}
					actions={
						<>
							{isDirty && (
								<span className="type-metadata text-[var(--text-tertiary)] shrink-0">
									Unsaved changes
								</span>
							)}
							<Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={saving}>
								Cancel
							</Button>
							<Button
								variant="primary"
								size="sm"
								type="button"
								onClick={() => void handleSave()}
								disabled={saving}
							>
								{saving && <span className="loading loading-spinner loading-xs" />}
								Save
							</Button>
						</>
					}
				/>
			}
		>
			{/* Same content as AgentEditDialog, Dialog shell stripped */}
			<div className="p-[18px]">
				{/* Lead avatar + role info — agentName already shown in PageHeader */}
				<div className="flex items-center gap-[12px] mb-[18px]">
					<Avatar initials={initials} size="sm" agent />
					<div>
						<p className="type-small  text-[var(--text-secondary)]">{roleLabel}</p>
						<p className="type-small  text-[var(--text-secondary)] mt-[3px]">{roleDescription}</p>
					</div>
				</div>

				{/* Identity section. It is a knowledge document, so this pane links
				    to it rather than keeping a third copy of the same editor. */}
				<div className="mt-[18px]">
					<h3 className="type-label   uppercase  text-[var(--text-tertiary)] mb-[6px]">IDENTITY</h3>
					<p className="type-metadata  text-[var(--text-tertiary)] mb-[6px]">
						Personality, style, and values. You define who the agent is; the harness provides tools,
						context, and knowledge.
					</p>

					{agent.identityKnowledgeId ? (
						<RRLink
							to={`/knowledge/${agent.identityKnowledgeId}`}
							data-testid="agent-detail-identity-link"
							className="type-metadata  text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
						>
							Edit identity document
						</RRLink>
					) : (
						<p className="type-metadata  text-[var(--text-tertiary)]">
							This agent has no identity document yet.
						</p>
					)}
				</div>

				{/* Config section toggle */}
				<div className="mt-[12px]">
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onClick={() => setConfigVisible((v) => !v)}
					>
						{configVisible ? "Hide configuration" : "Show configuration"}
					</Button>

					{configVisible && (
						<div className="mt-[6px] flex flex-wrap gap-[12px]">
							<div className="min-w-[140px] flex-1">
								<Input
									id="pane-dialog-harness"
									label="Harness"
									type="text"
									value={formValues.harnessType}
									onChange={(e) =>
										setFormValues((prev) => ({ ...prev, harnessType: e.target.value }))
									}
									placeholder="e.g. claude-code"
									disabled={saving}
								/>
							</div>

							<div className="min-w-[100px] flex-1">
								<Input
									id="pane-dialog-sessions"
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
									disabled={saving}
								/>
							</div>
						</div>
					)}
				</div>
			</div>
		</PageScaffold>
	);
}
