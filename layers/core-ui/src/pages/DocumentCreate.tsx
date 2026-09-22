/**
 * DocumentCreate — full-page create flow at /documents/new.
 *
 * Replaces the KnowledgeCreateDialog overlay with a full-page layout matching
 * the knowledge-edit.html mockup (create variant).
 *
 * Layout: bordered header (breadcrumb + title input + action buttons) + two-column
 * body (BodyEditor left, metadata card right).
 *
 * @lore visual-parity W-01: this is a CREATE page, not a copy of the edit page.
 * Differences from DocumentDetail:
 * - Title is an editable <input> (not a static heading)
 * - No "Saved" indicator (nothing to save yet)
 * - "Create" button (disabled until title + body have content) replaces "Done"
 * - Metadata aside: Kind selector + Scope inputs (not static badges)
 * - No Backlinks card (new item has none)
 * - No Discussion section (new item has no thread)
 *
 * @lore BC4: repointed off `POST /api/knowledge` onto
 * `call("edit_document", …)` — the create door is the same action a person
 * and an agent both use (architecture.md §3.5). `updatedBy` is gone (it is
 * `ctx.actor`); a chosen parent rides the create call as `parent:{kind:
 * "document", id}`, still one write, no follow-up PATCH.
 */

import { SCOPES_REQUIRING_ID, type ScopeKind } from "@hyperidle/domain-model";
import { type JSX, useState } from "react";
import { Link as RRLink, useNavigate, useSearchParams } from "react-router-dom";
// hearth-internal-padding
import {
	BodyEditor,
	Breadcrumb,
	Button,
	Input,
	PageHeader,
	PageScaffold,
	pageTitleClassName,
	ScopePicker,
} from "../ds";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { call } from "../services/call.js";
import { SCOPE_CREATE_OPTIONS, type ScopeCreateOption } from "../utils/scope-labels.js";
import { ParentPicker } from "./document/ParentPicker.js";

export function DocumentCreate(): JSX.Element {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user } = useCurrentUser();

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	/**
	 * AD6: 3-pill scope picker replaces 7-item SCOPE_KINDS dropdown.
	 * Default: Shared (→ factory scopeKind).
	 */
	// SCOPE_CREATE_OPTIONS is a constant array of 3 items; index 0 is always defined.
	const defaultScope: ScopeCreateOption = SCOPE_CREATE_OPTIONS[0] ?? {
		label: "Shared",
		id: "shared",
		scopeKind: "factory",
	};
	const [selectedScope, setSelectedScope] = useState<ScopeCreateOption>(defaultScope);
	const [scopeId, setScopeId] = useState("");
	/**
	 * @lore nested-knowledge-items: "" is top level (a root) — plan.md AC2,
	 * "the create flow picks a parent, defaulting to none (a root)."
	 * Tree "Add child" and detail ChildrenCard navigate here with
	 * `?parentId=` so the ParentPicker opens preselected — init only;
	 * submit payload shape is unchanged.
	 */
	const [parentId, setParentId] = useState(() => searchParams.get("parentId") ?? "");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// AF13 §6: Team pill is data-driven — enabled only when the user belongs to a team.
	// @lore AF13: CurrentUser.teamId is now populated from the API (GET /api/auth/me).
	// The previous hardcoded false is replaced by a live check so the team scope
	// pill becomes available as soon as the user joins a team.
	const hasTeam: boolean = user?.teamId !== undefined;

	const needsScopeId = SCOPES_REQUIRING_ID.has(selectedScope.scopeKind);
	const canCreate =
		title.trim().length > 0 &&
		body.trim().length > 0 &&
		(!needsScopeId || scopeId.trim().length > 0) &&
		!submitting;

	const handleCreate = async (): Promise<void> => {
		const trimmedTitle = title.trim();
		const trimmedBody = body.trim();
		if (!(trimmedTitle && trimmedBody)) return;

		setSubmitting(true);
		setError(null);

		const scope: ScopeKind = selectedScope.scopeKind;
		const result = await call("edit_document", {
			title: trimmedTitle,
			body: trimmedBody,
			format: "markdown",
			// AF13 §1: human-initiated creates are immediately active (not
			// proposed, edit_document's create default) — an agent omits status
			// and gets "proposed".
			status: "active",
			scopeKind: scope,
			...(needsScopeId ? { scopeId: scopeId.trim() } : {}),
			...(parentId !== "" ? { parent: { kind: "document" as const, id: parentId } } : {}),
		});

		setSubmitting(false);

		if (!result.ok) {
			setError(result.problems[0]?.message ?? "Failed to create document.");
			return;
		}

		navigate(`/documents/${result.data.document.id}`);
	};

	const handleCancel = (): void => {
		navigate("/documents");
	};

	return (
		<PageScaffold
			frame="page"
			data-testid="document-create-page"
			header={
				/* AI7: PageHeader with editable title input.
				    @lore AI7-W1: pageTitleClassName is an identifier expression so
				    no-handrolled-page-header does not fire (rule only checks literals). */
				<PageHeader
					leading={
						/* AG4: DS Breadcrumb — create page, NO leading cluster (not a detail route) */
						<Breadcrumb
							segments={[{ label: "Documents", to: "/documents" }, { label: "New document" }]}
							LinkComponent={RRLink}
						/>
					}
					title={
						<input
							type="text"
							aria-label="Document title"
							data-testid="document-create-title"
							placeholder="Untitled"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							disabled={submitting}
							maxLength={500}
							className={`${pageTitleClassName} bg-transparent border-none outline-none focus-visible:outline-none focus-visible:underline decoration-[var(--border-default)] underline-offset-2 cursor-text flex-1 p-0`}
						/>
					}
					actions={
						<div className="flex items-center gap-[9px]">
							{/* AI5: shared Button primitive (secondary/primary). */}
							<Button variant="secondary" onClick={handleCancel} disabled={submitting}>
								Cancel
							</Button>
							<Button
								variant="primary"
								data-testid="document-create-submit"
								onClick={() => void handleCreate()}
								disabled={!canCreate}
							>
								{submitting ? "Creating…" : "Create"}
							</Button>
						</div>
					}
				/>
			}
		>
			{/* Two-column layout.
			 * @lore UI-127: items-stretch makes both columns grow to the same height.
			 * min-h-[calc(100svh-7rem)] fills the viewport below the PageHeader
			 * (~108px) so the editor claims the available vertical space rather than
			 * sitting in a 300px card on a vast empty canvas. flex-1 on the card
			 * (not a fixed minHeight) lets it grow with the column. */}
			<div
				className="max-w-[960px] w-full py-[24px] flex gap-[24px] items-stretch min-h-[calc(100svh-7rem)]"
				data-testid="document-create-body"
			>
				{/* Left: editor */}
				<div className="flex-1 min-w-0 flex flex-col gap-[12px]">
					{error && (
						<p
							role="alert"
							data-testid="document-create-error"
							className="type-metadata  text-[var(--status-error)]"
						>
							{error}
						</p>
					)}
					<div className="border-width-default  border-[var(--border-default)] rounded-[var(--r-default)] p-[18px] flex-1">
						<BodyEditor
							initialContent=""
							onChange={(md: string) => setBody(md)}
							placeholder="Describe it in markdown…"
							variant="full"
							minHeight="100%"
							editable={!submitting}
						/>
					</div>
				</div>

				{/*
				 * Right: metadata card.
				 * AD6: Kind selector removed. Scope replaced by 3-pill segmented control.
				 * Shared → factory | Team → team (disabled without teamId) | Private → user.
				 */}
				<aside className="shrink-0 flex flex-col gap-[12px]" style={{ width: "240px" }}>
					<div
						className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[12px]"
						data-testid="document-create-metadata"
					>
						{/* Scope picker — 3 static pills */}
						<div className="flex flex-col gap-[6px]">
							<span className="type-label   uppercase  text-[var(--text-tertiary)]">Scope</span>
							{/* AI5: consolidated to the shared ScopePicker primitive (select mode).
								    Team is disabled while submitting or when the user has no team. */}
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
										// A parent legal under the old scope may not be legal
										// under the new one (the narrowing rule) — reset rather
										// than offer a stale, possibly-illegal choice.
										setParentId("");
									}
								}}
								ariaLabel="Scope"
								testIdPrefix="scope-pill-create"
								disabledTitle="Join a team to use team-scoped documents"
							/>
						</div>
						{needsScopeId && (
							<Input
								label="Scope ID"
								type="text"
								placeholder={`${selectedScope.label} ID`}
								value={scopeId}
								onChange={(e) => setScopeId(e.target.value)}
								disabled={submitting}
							/>
						)}
						{/* @lore nested-knowledge-items: plan.md AC2 — "the create flow
						    picks a parent, defaulting to none (a root)." */}
						<ParentPicker
							value={parentId}
							onChange={setParentId}
							childScopeKind={selectedScope.scopeKind}
							disabled={submitting}
						/>
					</div>
				</aside>
			</div>
		</PageScaffold>
	);
}
