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
	 * Current scope id, when the current scope names one (a team) — allows
	 * the initial render to prefill it, not just on a fresh Team click.
	 */
	currentScopeId: string | null;
	/**
	 * Whether the document has a parent — Private is disabled for a root
	 * (parentless) document: a parentless `"user"`-scoped row reads back as a
	 * memory (`documentAs`), so widening it away from Private is refused. A
	 * private tree document (one with a parent) is not a memory and stays
	 * unaffected.
	 */
	hasParent: boolean;
}

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
	const { user } = useCurrentUser();
	const hasTeam: boolean = user?.teamId !== undefined;

	const [selectedOption, setSelectedOption] = useState<ScopeCreateOption>(
		resolveDefaultOption(currentScopeKind),
	);
	const scopeKind: ScopeKind = selectedOption.scopeKind;
	// @lore: scopeId prefill — one-shot default, not a standing effect; a watching effect that refills on empty would fight manual input
	const [scopeId, setScopeId] = useState<string>(
		currentScopeKind === "team" ? (currentScopeId ?? user?.teamId ?? "") : "",
	);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	// @lore: isDirty — compares against currentScopeId not just non-empty; prefill makes scopeId non-empty on open, length check alone would show Esc guard untouched
	const isDirty =
		selectedOption.scopeKind !== currentScopeKind ||
		(needsScopeId && scopeId.trim() !== (currentScopeId ?? ""));
	const canSave = !submitting && isDirty && (needsScopeId ? scopeId.trim().length > 0 : true);

	const disabledReasons: string[] = [];
	if (!hasTeam) disabledReasons.push("Join a team to use team-scoped documents.");
	if (!hasParent) {
		disabledReasons.push(
			"A root document scoped Private becomes a memory — create one from Memories instead.",
		);
	}

	const handleSave = async (): Promise<void> => {
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
