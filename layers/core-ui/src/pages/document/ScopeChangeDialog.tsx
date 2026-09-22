/**
 * ScopeChangeDialog — moves a document to a different scope.
 *
 * Requires: new scope kind, and a scope id for scopes that name an entity.
 * Uses optimistic version tracking — the current version is sent so the
 * server can refuse a stale mutation.
 *
 * @lore BC4: PATCH `/api/knowledge/:id` replaced by
 * `call("edit_document", { id, scopeKind, scopeId?, version })`
 * (architecture.md §9.2). Scope is an ordinary field on the document, saved
 * through the same action the body and the slot use.
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
import { call } from "../../services/call.js";
import {
	SCOPE_CREATE_OPTIONS,
	type ScopeCreateOption,
	scopeKindToLabel,
} from "../../utils/scope-labels.js";

export interface ScopeChangeDialogProps {
	open: boolean;
	onClose: () => void;
	onSaved: () => void;
	/** The document id being mutated. */
	documentId: string;
	/** Current version for optimistic concurrency. */
	currentVersion: number;
	/** Current scope kind to pre-fill the select. */
	currentScopeKind: ScopeKind;
	/**
	 * Current scope id, when the current scope names one (a team). Review-found
	 * defect: opening with Team already the current scope showed an empty
	 * Scope ID field even though the document already had one — this is what
	 * lets the initial render prefill it instead of only prefilling on a
	 * fresh Team click.
	 */
	currentScopeId: string | null;
	/**
	 * Whether the document has a parent — review-found defect: a parentless
	 * (root) document scoped `"user"` reads back as a memory (`documentAs`),
	 * and widening it away from Private is then refused. Private is disabled
	 * here for a root document so that trapdoor can never be entered through
	 * this dialog; a private *tree* document (one with a parent) is not a
	 * memory and stays unaffected.
	 */
	hasParent: boolean;
}

/**
 * Maps a raw scopeKind to the matching SCOPE_CREATE_OPTIONS entry.
 * "factory" → "Shared", "team" → "Team", "user" → "Private" — a direct 1:1
 * match, since ScopeKind and SCOPE_CREATE_OPTIONS are both exactly these
 * three values.
 */
function resolveDefaultOption(scopeKind: ScopeKind): ScopeCreateOption {
	const exact = SCOPE_CREATE_OPTIONS.find((o) => o.scopeKind === scopeKind);
	if (exact) return exact;
	const label = scopeKindToLabel(scopeKind);
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
	documentId,
	currentVersion,
	currentScopeKind,
	currentScopeId,
	hasParent,
}: ScopeChangeDialogProps): JSX.Element | null {
	// Gate the Team option by hasTeam, matching DocumentCreate's logic.
	const { user } = useCurrentUser();
	const hasTeam: boolean = user?.teamId !== undefined;

	const [selectedOption, setSelectedOption] = useState<ScopeCreateOption>(
		resolveDefaultOption(currentScopeKind),
	);
	const scopeKind: ScopeKind = selectedOption.scopeKind;
	// Prefilled on initial render when the dialog opens with Team already the
	// current scope — from the document's own scopeId, falling back to the
	// user's own team when that is absent (review-found defect: this used to
	// stay empty until a person freshly clicked the Team pill, `onChange`
	// below). Still a one-shot default, not a standing effect: watching
	// `scopeId` and refilling on every empty value would fight a person
	// clearing the field to type a different id. The field stays editable.
	const [scopeId, setScopeId] = useState<string>(
		currentScopeKind === "team" ? (currentScopeId ?? user?.teamId ?? "") : "",
	);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	// Dirty means "differs from the current scope" — not "the id field is
	// non-empty". Review-found defect: the prefill above (line ~104) makes
	// `scopeId` non-empty from the very first render on a team document, so
	// a length check alone read every fresh open as dirty — Esc raised the
	// discard-confirm guard on a dialog nobody had touched. Comparing against
	// `currentScopeId` (not just non-empty) is what tells "still what's
	// stored" apart from "person actually changed it".
	const isDirty =
		selectedOption.scopeKind !== currentScopeKind ||
		(needsScopeId && scopeId.trim() !== (currentScopeId ?? ""));
	const canSave = !submitting && isDirty && (needsScopeId ? scopeId.trim().length > 0 : true);

	// The picker's `disabledTitle` is one shared tooltip for every disabled
	// pill (`ScopePicker`'s own contract) — composed from whichever reasons
	// apply, since Team and Private can be disabled at once for different
	// reasons (no team; a root document).
	const disabledReasons: string[] = [];
	if (!hasTeam) disabledReasons.push("Join a team to use team-scoped documents.");
	if (!hasParent) {
		disabledReasons.push(
			"A root document scoped Private becomes a memory — create one from Memories instead.",
		);
	}

	const handleSave = async (): Promise<void> => {
		// A scope that names an entity needs that entity's id; the server enforces
		// this too, this is just the local guard.
		if (needsScopeId && !scopeId.trim()) return;

		setSubmitting(true);
		setError(null);

		const result = await call("edit_document", {
			id: documentId,
			version: currentVersion,
			scopeKind,
			...(needsScopeId && scopeId.trim() ? { scopeId: scopeId.trim() } : {}),
		});

		if (!result.ok) {
			setError(result.problems[0]?.message ?? "Failed to change scope");
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
				<div className="flex flex-col gap-[6px]">
					<span className="type-metadata  text-[var(--text-tertiary)]">New scope</span>
					<ScopePicker
						options={SCOPE_CREATE_OPTIONS.map((opt) => ({
							id: opt.id,
							label: opt.label,
							disabled:
								submitting ||
								(opt.id === "team" && !hasTeam) ||
								(opt.id === "private" && !hasParent),
						}))}
						value={selectedOption.id}
						onChange={(id) => {
							const opt = SCOPE_CREATE_OPTIONS.find((o) => o.id === id);
							if (opt) {
								setSelectedOption(opt);
								setScopeId(opt.scopeKind === "team" ? (user?.teamId ?? "") : "");
							}
						}}
						ariaLabel="Scope kind"
						testIdPrefix="scope-pill-change"
						disabledTitle={disabledReasons.join(" ")}
					/>
				</div>

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
