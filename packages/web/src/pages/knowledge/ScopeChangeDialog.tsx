/**
 * ScopeChangeDialog — Q2 scope mutation flow.
 *
 * Allows the founder to move a knowledge item to a different scope.
 * Requires: new scope kind, scope id (for scopes that need one), and a reason.
 * Uses optimistic version tracking — the current version is sent with the PATCH
 * so the server can reject stale mutations.
 *
 * @lore Q2: Same native <dialog> pattern as ConsequencePreviewDialog /
 * KnowledgeCreateDialog. PATCH /api/knowledge/:id/scope carries
 * { scopeKind, scopeId?, reason, updatedBy, version }.
 *
 * @lore Q2 reviewer warning: scope_id dropdown loading state. For v1 the
 * scopeId is a free-text input (no dropdown). A dropdown requires fetching the
 * list of products/practices/teams etc. which is out of scope for Q2. The
 * free-text input satisfies the AC and unblocks the E2E tests.
 */

import { SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
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

export function ScopeChangeDialog({
	open,
	onClose,
	onSaved,
	knowledgeId,
	currentVersion,
	currentScopeKind,
}: ScopeChangeDialogProps): JSX.Element | null {
	if (!open) return null;
	return (
		<ScopeChangeDialogInner
			onClose={onClose}
			onSaved={onSaved}
			knowledgeId={knowledgeId}
			currentVersion={currentVersion}
			currentScopeKind={currentScopeKind}
		/>
	);
}

/**
 * Maps a raw scopeKind to the matching SCOPE_CREATE_OPTIONS entry.
 * Both "factory" and "practice" (shared scopes) map to the "Shared" option.
 * "team" and "product" map to "Team". "user" maps to "Private".
 * Any unrecognized scope defaults to "Shared".
 *
 * @lore AF13 §4A: The previous raw 7-enum select used SCOPE_KINDS directly,
 * leaking internal vocabulary to users. This helper maps current scope kind
 * to one of the 3 user-facing options, with "factory" and "practice" both
 * resolving to "Shared" so there is no phantom "practice" option.
 */
function resolveDefaultOption(scopeKind: ScopeKind): ScopeCreateOption {
	const label = scopeKindToLabel(scopeKind); // "Shared" | "Team" | "Private"
	return (
		SCOPE_CREATE_OPTIONS.find((o) => o.label === label) ??
		// Safe fallback: SCOPE_CREATE_OPTIONS always has 3 entries; index 0 is Shared.
		(SCOPE_CREATE_OPTIONS[0] as ScopeCreateOption)
	);
}

function ScopeChangeDialogInner({
	onClose,
	onSaved,
	knowledgeId,
	currentVersion,
	currentScopeKind,
}: Omit<ScopeChangeDialogProps, "open">): JSX.Element {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const { user } = useCurrentUser();

	// AF13 plan §6: Gate Team option by hasTeam, matching KnowledgeCreate's logic.
	const hasTeam: boolean = user?.teamId !== undefined;

	// AF13 §4A: Replace raw 7-enum select with 3 labeled SCOPE_CREATE_OPTIONS.
	// The selected option holds both the user-facing label and the API scopeKind.
	const [selectedOption, setSelectedOption] = useState<ScopeCreateOption>(
		resolveDefaultOption(currentScopeKind),
	);
	const scopeKind: ScopeKind = selectedOption.scopeKind;
	const [scopeId, setScopeId] = useState<string>("");
	const [reason, setReason] = useState<string>("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	const canSave = reason.trim().length > 0 && !submitting;

	// Open the native dialog on mount.
	// @lore Q2: JSDOM guard — same as other dialogs in the codebase.
	// The inner component is only rendered when open=true, so we always show on mount.
	useEffect(() => {
		if (!dialogRef.current) return;
		if (!dialogRef.current.open) {
			if (typeof dialogRef.current.showModal === "function") {
				dialogRef.current.showModal();
			} else {
				dialogRef.current.setAttribute("open", "");
			}
		}
	}, []);

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

	const handleCancel = (): void => {
		if (submitting) return;
		onClose();
	};

	return (
		<dialog ref={dialogRef} aria-modal="true" aria-label="Change scope">
			<div className="p-4 flex flex-col gap-3 min-w-[320px] max-w-[480px] w-full">
				<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">
					Change scope
				</h2>

				{/* AF13 §4A: Scope kind — 3 labeled options (Shared/Team/Private).      */}
				{/* Previously rendered all 7 SCOPE_KINDS as raw enum values.          */}
				{/* AF13 plan §6: Team option disabled when user has no teamId,         */}
				{/* matching the same hasTeam gate in KnowledgeCreate.                  */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">New scope</span>
					<select
						className="select select-bordered select-sm"
						aria-label="Scope kind"
						value={selectedOption.label}
						onChange={(e) => {
							const opt = SCOPE_CREATE_OPTIONS.find((o) => o.label === e.target.value);
							if (opt) {
								setSelectedOption(opt);
								setScopeId("");
							}
						}}
						disabled={submitting}
					>
						{SCOPE_CREATE_OPTIONS.map((opt) => {
							const isTeamOption = opt.id === "team";
							return (
								<option key={opt.id} value={opt.label} disabled={isTeamOption && !hasTeam}>
									{opt.label}
								</option>
							);
						})}
					</select>
				</label>

				{/* Scope ID — free text for scopes that need an external id. */}
				{needsScopeId && (
					<label className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-tertiary)]">Scope ID</span>
						<input
							type="text"
							className="input input-bordered input-sm text-base w-full"
							placeholder={`${scopeKind} ID`}
							value={scopeId}
							onChange={(e) => setScopeId(e.target.value)}
							disabled={submitting}
						/>
					</label>
				)}

				{/* Reason — required */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">
						Reason <span aria-hidden>(required)</span>
					</span>
					<textarea
						className="textarea textarea-bordered text-base resize-none h-20 w-full"
						placeholder="Why are you changing the scope?"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						disabled={submitting}
						maxLength={500}
					/>
				</label>

				{error && (
					<p role="alert" className="text-xs text-error">
						{error}
					</p>
				)}

				<div className="flex gap-2 justify-end">
					<button
						type="button"
						className="btn btn-xs btn-ghost"
						onClick={handleCancel}
						disabled={submitting}
					>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-xs btn-primary"
						onClick={() => void handleSave()}
						disabled={!canSave}
					>
						{submitting ? "…" : "Save"}
					</button>
				</div>
			</div>
		</dialog>
	);
}
