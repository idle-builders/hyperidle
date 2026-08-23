/**
 * ScopeChangeDialog — Q2 scope mutation flow.
 *
 * Allows the founder to move a knowledge item to a different scope.
 * Requires: new scope kind, scope id (for scopes that need one), and a reason.
 * Uses optimistic version tracking — the current version is sent with the PATCH
 * so the server can reject stale mutations.
 *
 * @lore Q2: Same Dialog primitive pattern as KnowledgeCreateDialog.
 * PATCH /api/knowledge/:id/scope carries { scopeKind, scopeId?, reason, updatedBy, version }.
 *
 * @lore Q2 reviewer warning: scope_id dropdown loading state. For v1 the
 * scopeId is a free-text input (no dropdown). A dropdown requires fetching the
 * list of products/practices/teams etc. which is out of scope for Q2. The
 * free-text input satisfies the AC and unblocks the E2E tests.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() to Dialog primitive.
 * isDirty = reason entered or scope changed from current. Authoring surface — guards.
 */

import { Button, Dialog, Input, ScopePicker } from "@hyperidle/design-system";
import { SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { apiFetch } from "../../services/api-fetch.js";
import {
	SCOPE_CREATE_OPTIONS,
	type ScopeCreateOption,
	scopeKindToLabel,
} from "../../utils/scope-labels.js";

export interface ScopeChangeDialogProps {
	open: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** The knowledge item id being mutated. */
	knowledgeId: string;
	/** Current version for optimistic concurrency. */
	currentVersion: number;
	/** Current scope kind to pre-fill the select. */
	currentScopeKind: ScopeKind;
}

/**
 * Maps a raw scopeKind to the matching SCOPE_CREATE_OPTIONS entry.
 * Both "factory" and "practice" (shared scopes) map to the "Shared" option.
 * "team" and "product" map to "Team". "user" maps to "Private".
 * Any unrecognized scope defaults to "Shared".
 *
 * @lore AV3 A2: Prefer exact option matches before bucket fallback so first-class
 * role/filesystem scopes stay selected instead of collapsing to Shared.
 */
function resolveDefaultOption(scopeKind: ScopeKind): ScopeCreateOption {
	const exact = SCOPE_CREATE_OPTIONS.find((o) => o.scopeKind === scopeKind);
	if (exact) return exact;
	const label = scopeKindToLabel(scopeKind); // "Shared" | "Team" | "Private"
	return (
		SCOPE_CREATE_OPTIONS.find((o) => o.label === label) ??
		// Safe fallback: SCOPE_CREATE_OPTIONS always has 3 entries; index 0 is Shared.
		(SCOPE_CREATE_OPTIONS[0] as ScopeCreateOption)
	);
}

export function ScopeChangeDialog({
	open,
	onClose,
	onSaved,
	knowledgeId,
	currentVersion,
	currentScopeKind,
}: ScopeChangeDialogProps): JSX.Element | null {
	const { user } = useCurrentUser();

	// AF13 §4A: Gate Team option by hasTeam, matching KnowledgeCreate's logic.
	const hasTeam: boolean = user?.teamId !== undefined;

	// AF13 §4A: Replace raw 7-enum select with 3 labeled SCOPE_CREATE_OPTIONS.
	const [selectedOption, setSelectedOption] = useState<ScopeCreateOption>(
		resolveDefaultOption(currentScopeKind),
	);
	const scopeKind: ScopeKind = selectedOption.scopeKind;
	const [scopeId, setScopeId] = useState<string>("");
	const [reason, setReason] = useState<string>("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	const isDirty = reason.trim().length > 0 || selectedOption.scopeKind !== currentScopeKind;
	const canSave = reason.trim().length > 0 && !submitting;

	const handleSave = async (): Promise<void> => {
		const trimmedReason = reason.trim();
		if (!trimmedReason) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> = {
			scopeKind,
			reason: trimmedReason,
			version: currentVersion,
			updatedBy: user?.id ?? "human",
		};

		if (needsScopeId && scopeId.trim()) {
			payload.scopeId = scopeId.trim();
		}

		const res = await apiFetch(`/api/knowledge/${encodeURIComponent(knowledgeId)}/scope`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to change scope: ${res.status}`);
			setSubmitting(false);
			return;
		}

		setSubmitting(false);
		onSaved();
		onClose();
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Change scope"
			isDirty={isDirty}
			size="sm"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={!canSave}>
						{submitting ? "…" : "Save"}
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				{/* Scope kind — labeled options. Previously rendered raw enum values. */}
				{/* AF13 plan §6: Team option disabled when user has no teamId,         */}
				{/* matching the same hasTeam gate in KnowledgeCreate.                  */}
				{/* AI5: migrated from <Select> to the canonical ScopePicker pill group
				    (scope-picker is AI5-owned; the pill group is the one anatomy
				    rendered at all 4 scope sites). New testid prefix scope-pill-change. */}
				<div className="flex flex-col gap-[6px]">
					<span className="type-metadata  text-[var(--text-tertiary)]">New scope</span>
					<ScopePicker
						options={SCOPE_CREATE_OPTIONS.map((opt) => ({
							id: opt.id,
							label: opt.label,
							disabled: submitting || (opt.id === "team" && !hasTeam),
						}))}
						value={selectedOption.id}
						onChange={(id) => {
							const opt = SCOPE_CREATE_OPTIONS.find((o) => o.id === id);
							if (opt) {
								setSelectedOption(opt);
								setScopeId("");
							}
						}}
						ariaLabel="Scope kind"
						testIdPrefix="scope-pill-change"
						disabledTitle="Join a team to use team-scoped knowledge"
					/>
				</div>

				{/* Scope ID — free text for scopes that need an external id. */}
				{needsScopeId && (
					<Input
						label="Scope ID"
						type="text"
						placeholder={`${scopeKind} ID`}
						value={scopeId}
						onChange={(e) => setScopeId(e.target.value)}
						disabled={submitting}
					/>
				)}

				{/* Reason — required */}
				<Input
					textarea
					label="Reason (required)"
					placeholder="Why are you changing the scope?"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={submitting}
					maxLength={500}
				/>

				{error && (
					<p role="alert" className="type-metadata  text-error">
						{error}
					</p>
				)}
			</div>
		</Dialog>
	);
}
