/**
 * ScopeChangeDialog — Q2 scope mutation flow.
 *
 * Allows the founder to move a knowledge item to a different scope.
 * Requires: new scope kind, and a scope id for scopes that name an entity.
 * Uses optimistic version tracking — the current version is sent with the PATCH
 * so the server can reject stale mutations.
 *
 * @lore Q2: Same Dialog primitive pattern as KnowledgeCreateDialog.
 * Scope is an ordinary field on the document, so this saves through
 * PATCH /api/knowledge/:id with { scopeKind, scopeId?, updatedBy, version } —
 * the same endpoint the body and the role use. The separate /scope endpoint and
 * the reason it demanded are deleted; nothing ever read that reason.
 *
 * @lore Q2 reviewer warning: scope_id dropdown loading state. For v1 the
 * scopeId is a free-text input (no dropdown). A dropdown requires fetching the
 * list of products/practices/teams etc. which is out of scope for Q2. The
 * free-text input satisfies the AC and unblocks the E2E tests.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() to Dialog primitive.
 * isDirty = scope changed from current. Authoring surface — guards.
 */

import { SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { Button, Dialog, Input, ScopePicker } from "../../ds";
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
 * "factory" → "Shared", "team" → "Team", "user" → "Private" — a direct 1:1
 * match, since ScopeKind and SCOPE_CREATE_OPTIONS are both exactly these
 * three values.
 *
 * @lore nested-knowledge-items: retired product/practice/task.
 * @lore AV3 A2: the label-based fallback below predates that collapse, back
 * when a scopeKind could lack an exact SCOPE_CREATE_OPTIONS entry. It is
 * unreachable now but kept as a defensive default rather than deleted —
 * `scopeKind` is a closed union today, but this function's whole job is to
 * degrade gracefully if that ever changes again.
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
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	const isDirty = selectedOption.scopeKind !== currentScopeKind || scopeId.trim().length > 0;
	const canSave = isDirty && !submitting;

	const handleSave = async (): Promise<void> => {
		// A scope that names an entity needs that entity's id; the server enforces
		// this too, this is just the local guard.
		if (needsScopeId && !scopeId.trim()) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> = {
			scopeKind,
			version: currentVersion,
			updatedBy: user?.id ?? "human",
		};

		if (needsScopeId && scopeId.trim()) {
			payload.scopeId = scopeId.trim();
		}

		const res = await apiFetch(`/api/knowledge/${encodeURIComponent(knowledgeId)}`, {
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

				{error && (
					<p role="alert" className="type-metadata  text-error">
						{error}
					</p>
				)}
			</div>
		</Dialog>
	);
}
