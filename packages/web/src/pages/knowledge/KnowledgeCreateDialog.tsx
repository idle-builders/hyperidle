/**
 * KnowledgeCreateDialog — Q2 creation flow.
 *
 * Opens as a native <dialog> (same pattern as ConsequencePreviewDialog /
 * AppetiteDialog in WorkBet.tsx). Title + body required; scopeKind defaults
 * to "factory". When a lockedScopeKind is provided the scope is displayed as
 * a read-only Tag and the combobox is hidden (bet/task contextual creation).
 *
 * @lore Q2: `user` and `factory` scopes never require a scopeId. Scopes that
 * require a scopeId (product, practice, team, bet, task) show a text input
 * for the id when the user selects them and lockedScopeKind is absent.
 * For locked scopes the scopeId is passed in as `lockedScopeId` (e.g. the
 * bet id when opening from bet detail).
 *
 * @lore Q2 reviewer warning: mobile dialog sizing — the dialog container uses
 * min-w-[320px] max-w-[480px] w-full so it never overflows on small screens.
 * Inputs are text-base (16px) to prevent iOS Safari zoom on focus.
 */

import { BodyEditor } from "@hyperidle/design-system";
import { SCOPE_KINDS, SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/shared";
import { type JSX, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";
import { useTeams } from "../../hooks/useTeams.js";
import { apiFetch } from "../../services/api-fetch.js";

// AD3 AC-3: Simplified scope options shown when there is exactly 1 team (solo/single-team mode).
// "factory" maps to "Shared" and "user" maps to "Personal" — the two scopes that don't
// require a team or project context to be meaningful for a solo founder.
const SOLO_SCOPES: ReadonlyArray<{ value: ScopeKind; label: string }> = [
	{ value: "factory", label: "Shared" },
	{ value: "user", label: "Personal" },
];

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
	// AD3 AC-3: single-team detection — simplify scope picker when there's only 1 team.
	const { data: teamsData } = useTeams();
	const isSingleTeam = (teamsData?.teams?.length ?? 0) === 1;

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [scopeKind, setScopeKind] = useState<ScopeKind>(lockedScopeKind ?? "factory");
	const [scopeId, setScopeId] = useState<string>(lockedScopeId ?? "");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isLocked = lockedScopeKind !== undefined;
	const effectiveScopeKind = isLocked ? lockedScopeKind : scopeKind;
	const needsScopeId = SCOPES_REQUIRING_ID.has(effectiveScopeKind);
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
			setScopeKind(lockedScopeKind ?? "factory");
			setScopeId(lockedScopeId ?? "");
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
	}, [open, lockedScopeKind, lockedScopeId]);

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

		if (needsScopeId && scopeId.trim()) {
			payload.scopeId = scopeId.trim();
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

				{/* Scope kind — locked (read-only Tag) or open combobox */}
				<div className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">Scope</span>
					{isLocked ? (
						<span className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-subtle)] text-[12px] bg-[var(--surface-container)] text-[var(--text-secondary)] w-fit">
							{lockedScopeKind}
						</span>
					) : isSingleTeam ? (
						// AD3 AC-3: single-team — show only Shared (factory) and Personal (user)
						<select
							className="select select-bordered select-sm"
							aria-label="Scope kind"
							value={scopeKind}
							onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
							disabled={submitting}
						>
							{SOLO_SCOPES.map(({ value, label }) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					) : (
						<select
							className="select select-bordered select-sm"
							aria-label="Scope kind"
							value={scopeKind}
							onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
							disabled={submitting}
						>
							{SCOPE_KINDS.map((kind) => (
								<option key={kind} value={kind}>
									{kind}
								</option>
							))}
						</select>
					)}
				</div>

				{/* Scope ID — shown when the selected scope requires an external id
				    and the scope is not locked (locked scopes pass lockedScopeId). */}
				{needsScopeId && !isLocked && (
					<label className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-tertiary)]">Scope ID</span>
						<input
							type="text"
							className="input input-bordered input-sm text-base w-full"
							placeholder={`${effectiveScopeKind} ID`}
							value={scopeId}
							onChange={(e) => setScopeId(e.target.value)}
							disabled={submitting}
						/>
					</label>
				)}

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
