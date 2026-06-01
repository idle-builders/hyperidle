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

import { SCOPE_KINDS, SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { apiFetch } from "../../services/api-fetch.js";

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
	const dialogRef = useRef<HTMLDialogElement>(null);
	const { user } = useCurrentUser();

	const [scopeKind, setScopeKind] = useState<ScopeKind>(currentScopeKind);
	const [scopeId, setScopeId] = useState<string>("");
	const [reason, setReason] = useState<string>("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const needsScopeId = SCOPES_REQUIRING_ID.has(scopeKind);
	const canSave = reason.trim().length > 0 && !submitting;

	// Sync native dialog open/closed with `open` prop.
	// @lore Q2: JSDOM guard — same as other dialogs in the codebase.
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			setScopeKind(currentScopeKind);
			setScopeId("");
			setReason("");
			setError(null);
			setSubmitting(false);
			if (!dialogRef.current.open) {
				if (typeof dialogRef.current.showModal === "function") {
					dialogRef.current.showModal();
				} else {
					dialogRef.current.setAttribute("open", "");
				}
			}
		} else if (dialogRef.current.open) {
			if (typeof dialogRef.current.close === "function") {
				dialogRef.current.close();
			} else {
				dialogRef.current.removeAttribute("open");
			}
		}
	}, [open, currentScopeKind]);

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

				{/* Scope kind select */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">New scope</span>
					<select
						className="select select-bordered select-sm"
						aria-label="Scope kind"
						value={scopeKind}
						onChange={(e) => {
							setScopeKind(e.target.value as ScopeKind);
							setScopeId("");
						}}
						disabled={submitting}
					>
						{SCOPE_KINDS.map((kind) => (
							<option key={kind} value={kind}>
								{kind}
							</option>
						))}
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
