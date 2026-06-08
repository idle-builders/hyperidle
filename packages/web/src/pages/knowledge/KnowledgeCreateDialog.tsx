/**
 * KnowledgeCreateDialog — Q2 / AD6 creation flow.
 *
 * Opens as a native <dialog> (same pattern as ConsequencePreviewDialog /
 * AppetiteDialog in WorkBet.tsx). Title + body required; scopeKind defaults
 * to "factory" (Shared). When a lockedScopeKind is provided the scope is
 * displayed as a read-only Tag and the pill picker is hidden (bet/task
 * contextual creation).
 *
 * @lore AD6: Replaced the 7-item SCOPE_KINDS dropdown + Scope ID text input
 * with the same 3-pill segmented control used in KnowledgeCreate. The scopeId
 * field is auto-resolved (not user-visible) so the Scope ID input is removed.
 * scopeKind values: Shared → factory | Team → team (disabled without teamId)
 * | Private → user.
 *
 * @lore Q2 reviewer warning: mobile dialog sizing — the dialog container uses
 * min-w-[320px] max-w-[480px] w-full so it never overflows on small screens.
 * Inputs are text-base (16px) to prevent iOS Safari zoom on focus.
 */

import { BodyEditor } from "@hyperidle/design-system";
import type { ScopeKind } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";

import { apiFetch } from "../../services/api-fetch.js";
import { SCOPE_CREATE_OPTIONS, type ScopeCreateOption } from "../../utils/scope-labels.js";

// AD3 AC-3: Simplified scope options shown when there is exactly 1 team (solo/single-team mode).

export interface KnowledgeCreateDialogProps {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
	/** When set, the scope kind is locked (read-only Tag shown, no combobox). */
	lockedScopeKind?: ScopeKind;
	/** Paired with lockedScopeKind — the external id for bet/task contexts. */
	lockedScopeId?: string | null;
}

export function KnowledgeCreateDialog({
	open,
	onClose,
	onCreated,
	lockedScopeKind,
	lockedScopeId,
}: KnowledgeCreateDialogProps): JSX.Element | null {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const { user } = useCurrentUser();

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	/**
	 * AD6: 3-pill scope picker replaces 7-item SCOPE_KINDS dropdown.
	 * Default: Shared (→ factory scopeKind).
	 */
	const [selectedScope, setSelectedScope] = useState<ScopeCreateOption>(SCOPE_CREATE_OPTIONS[0]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isLocked = lockedScopeKind !== undefined;
	const effectiveScopeKind: ScopeKind = isLocked ? lockedScopeKind : selectedScope.scopeKind;
	// Team pill is disabled when the user has no teamId.
	// @lore AD6: CurrentUser does not yet include teamId — team feature pending.
	// Until extended, team scope is always disabled in the dialog.
	const hasTeam: boolean = false;
	const canCreate = title.trim().length > 0 && body.trim().length > 0 && !submitting;

	// Sync the native dialog open/closed state with the `open` prop.
	// @lore Q2: same JSDOM guard as ConsequencePreviewDialog — showModal() is not
	// implemented in JSDOM so we fall back to setAttribute("open", "").
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			// Reset form state on open.
			setTitle("");
			setBody("");
			setSelectedScope(SCOPE_CREATE_OPTIONS[0]);
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
	}, [open]);

	const handleSubmit = async (): Promise<void> => {
		const trimmedTitle = title.trim();
		const trimmedBody = body.trim();
		if (!(trimmedTitle && trimmedBody)) return;

		setSubmitting(true);
		setError(null);

		const payload: Record<string, unknown> = {
			title: trimmedTitle,
			body: trimmedBody,
			format: "markdown",
			scopeKind: effectiveScopeKind,
			updatedBy: user?.id ?? "human",
		};

		// AD6: scopeId auto-resolved; locked scope passes lockedScopeId if set.
		if (isLocked && lockedScopeId) {
			payload.scopeId = lockedScopeId;
		}

		const res = await apiFetch("/api/knowledge", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			setError(data.error ?? `Failed to create item: ${res.status}`);
			setSubmitting(false);
			return;
		}

		setSubmitting(false);
		onCreated();
		onClose();
	};

	const handleCancel = (): void => {
		if (submitting) return;
		onClose();
	};

	return (
		<dialog ref={dialogRef} aria-modal="true" aria-label="New knowledge item">
			<div className="p-4 flex flex-col gap-3 min-w-[320px] max-w-[480px] w-full">
				<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">
					New knowledge item
				</h2>

				{/* Title input */}
				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">
						Title <span aria-hidden>(required)</span>
					</span>
					<input
						type="text"
						className="input input-bordered input-sm text-base w-full"
						placeholder="What did you learn?"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						disabled={submitting}
						maxLength={500}
					/>
				</label>

				{/* Body field — T2: replaced textarea with BodyEditor */}
				{/* @lore T2: <div> instead of <label> — BodyEditor renders a ProseMirror contenteditable
				    which is not a labelable element; <label> with no associated control triggers
				    lint/a11y/noLabelWithoutControl. The inner ProseMirror sets its own aria role. */}
				<div className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">
						Body <span aria-hidden>(required)</span>
					</span>
					<BodyEditor
						initialContent=""
						onChange={(md) => setBody(md)}
						placeholder="Describe it in markdown..."
						variant="full"
						minHeight="128px"
						editable={!submitting}
					/>
				</div>

				{/* Scope — locked (read-only tag) or 3-pill segmented control */}
				<div className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">Scope</span>
					{isLocked ? (
						<span className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-subtle)] text-[12px] bg-[var(--surface-container)] text-[var(--text-secondary)] w-fit">
							{lockedScopeKind}
						</span>
					) : (
						/* AD6: 3-pill scope picker — same pattern as KnowledgeCreate */
						<div role="radiogroup" aria-label="Scope" className="flex gap-[6px] flex-wrap">
							{SCOPE_CREATE_OPTIONS.map((option) => {
								const isTeam = option.id === "team";
								const isDisabled = submitting || (isTeam && !hasTeam);
								const isActive = selectedScope.id === option.id;
								return (
									// biome-ignore lint/a11y/useSemanticElements: button+role="radio" used for pill styling with aria-checked; <input type="radio"> cannot be styled as a pill without full custom CSS reset
									<button
										key={option.id}
										type="button"
										data-testid={`scope-pill-dialog-${option.id}`}
										role="radio"
										aria-checked={isActive}
										aria-disabled={isDisabled ? "true" : undefined}
										data-active={isActive ? "true" : "false"}
										disabled={isDisabled}
										onClick={() => {
											if (!isDisabled) setSelectedScope(option);
										}}
										className={
											isActive
												? "border-[1.5px] border-[var(--accent-primary)] bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)] px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-pointer"
												: isDisabled
													? "border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] opacity-40 px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-not-allowed bg-transparent"
													: "border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-pointer bg-transparent"
										}
										title={
											isTeam && !hasTeam ? "Join a team to use team-scoped knowledge" : undefined
										}
									>
										{option.label}
									</button>
								);
							})}
						</div>
					)}
				</div>

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
						onClick={() => void handleSubmit()}
						disabled={!canCreate}
					>
						{submitting ? "…" : "Create"}
					</button>
				</div>
			</div>
		</dialog>
	);
}
