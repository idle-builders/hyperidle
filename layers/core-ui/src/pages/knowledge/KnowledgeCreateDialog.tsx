/**
 * KnowledgeCreateDialog — Q2 / AD6 creation flow.
 *
 * Opens as a Dialog primitive. Title + body required; scopeKind defaults
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
 * @lore Q2 reviewer warning: mobile dialog sizing — Dialog primitive handles
 * this via its built-in mobile bottom-sheet.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() JSDOM boilerplate to
 * Dialog primitive. isDirty = title or body non-empty (authoring surface, guards).
 * Title is now 15px/600 (--text-base/--fw-semibold) via Dialog chrome — the
 * old font-heading + text-sm h2 is removed (fixes off-scale 14px heading).
 */

import { BodyEditor, Dialog, ScopePicker } from "@hyperidle/design-system";
import { SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.js";

import { apiFetch } from "../../services/api-fetch.js";
import { SCOPE_CREATE_OPTIONS, type ScopeCreateOption } from "../../utils/scope-labels.js";

// AD3 AC-3: Simplified scope options shown when there is exactly 1 team (solo/single-team mode).

// SCOPE_CREATE_OPTIONS is a constant array of 3 items; index 0 is always defined.
// The nullish coalescing fallback satisfies noUncheckedIndexedAccess; it is unreachable.
// Module-level constant avoids capturing a per-render binding in useEffect deps.
const INITIAL_SCOPE_OPTION: ScopeCreateOption = SCOPE_CREATE_OPTIONS[0] ?? {
	label: "Shared",
	id: "shared",
	scopeKind: "factory",
};

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
	const { user } = useCurrentUser();

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	/**
	 * AD6: 3-pill scope picker replaces 7-item SCOPE_KINDS dropdown.
	 * Default: Shared (→ factory scopeKind).
	 */
	const [selectedScope, setSelectedScope] = useState<ScopeCreateOption>(INITIAL_SCOPE_OPTION);
	const [scopeId, setScopeId] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isLocked = lockedScopeKind !== undefined;
	const effectiveScopeKind: ScopeKind = isLocked ? lockedScopeKind : selectedScope.scopeKind;
	const needsScopeId = !isLocked && SCOPES_REQUIRING_ID.has(effectiveScopeKind);
	// Team pill is disabled when the user has no teamId.
	// @lore AD6: CurrentUser does not yet include teamId — team feature pending.
	// Until extended, team scope is always disabled in the dialog.
	const hasTeam: boolean = false;
	const isDirty = title.trim().length > 0 || body.trim().length > 0;
	const canCreate =
		title.trim().length > 0 &&
		body.trim().length > 0 &&
		(!needsScopeId || scopeId.trim().length > 0) &&
		!submitting;

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
		} else if (needsScopeId) {
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
		// Reset form state after successful creation
		setTitle("");
		setBody("");
		setSelectedScope(INITIAL_SCOPE_OPTION);
		setScopeId("");
		onCreated();
		onClose();
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="New knowledge item"
			isDirty={isDirty}
			size="md"
			footer={
				<>
					<button
						type="button"
						className="btn btn-xs btn-ghost"
						onClick={onClose}
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
				</>
			}
		>
			<div className="flex flex-col gap-3">
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

				{/* Body — BodyEditor (TipTap WYSIWYG, GFM markdown) */}
				<div className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">
						Body <span aria-hidden>(required)</span>
					</span>
					<BodyEditor
						initialContent={body}
						onChange={setBody}
						placeholder="Describe it in markdown..."
						editable={!submitting}
						minHeight="120px"
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
						/* AI5: consolidated to the shared ScopePicker primitive (select mode). */
						<ScopePicker
							options={SCOPE_CREATE_OPTIONS.map((option) => ({
								id: option.id,
								label: option.label,
								disabled: submitting || (option.id === "team" && !hasTeam),
							}))}
							value={selectedScope.id}
							onChange={(id) => {
								const next = SCOPE_CREATE_OPTIONS.find((o) => o.id === id);
								if (next) {
									setSelectedScope(next);
									setScopeId("");
								}
							}}
							ariaLabel="Scope"
							testIdPrefix="scope-pill-dialog"
							disabledTitle="Join a team to use team-scoped knowledge"
						/>
					)}
				</div>

				{needsScopeId && (
					<label className="flex flex-col gap-1">
						<span className="text-xs text-[var(--text-tertiary)]">Scope ID</span>
						<input
							type="text"
							className="input input-bordered input-sm text-base w-full"
							placeholder={`${selectedScope.label} ID`}
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
			</div>
		</Dialog>
	);
}
