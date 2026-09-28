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
import { scopeRank } from "./document/parent-options.js";

export function DocumentCreate(): JSX.Element {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { user } = useCurrentUser();

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	// SCOPE_CREATE_OPTIONS is a constant array of 3 items; index 0 is always defined
	const defaultScope: ScopeCreateOption = SCOPE_CREATE_OPTIONS[0] ?? {
		label: "Shared",
		id: "shared",
		scopeKind: "factory",
	};
	const [selectedScope, setSelectedScope] = useState<ScopeCreateOption>(defaultScope);
	const [scopeId, setScopeId] = useState("");
	// @lore: parentId="" — empty string means root (no parent); ?parentId= query string pre-selects parent for tree Add-child navigations
	const [parentId, setParentId] = useState(() => searchParams.get("parentId") ?? "");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	/**
	 * Who this document is for. Explicit only — a chosen parent never seeds
	 * this; scope isn't inherited from a parent either (see `handleParentChange`).
	 */
	const [discipline, setDiscipline] = useState("");

	const hasTeam: boolean = user?.teamId !== undefined;
	// @lore: Private scope — only legal with a parent chosen; parentless user-scoped write becomes a memory; Private not offered without parent
	const hasParentChosen: boolean = parentId !== "";

	const disabledReasons: string[] = [];
	if (!hasTeam) disabledReasons.push("Join a team to use team-scoped documents.");
	if (!hasParentChosen) {
		disabledReasons.push(
			"A root document scoped Private becomes a memory — create one from the assistant/agent instead.",
		);
	}

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
			// Human-initiated creates are immediately active (not
			// proposed, edit_document's create default) — an agent omits status
			// and gets "proposed".
			status: "active",
			scopeKind: scope,
			...(needsScopeId ? { scopeId: scopeId.trim() } : {}),
			...(parentId !== "" ? { parent: { kind: "document" as const, id: parentId } } : {}),
			discipline: discipline.trim() || null,
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

	// @lore: handleParentChange — clearing parent while Private selected falls back to Team/Shared; never silently stays on Private
	const handleParentChange = (next: string): void => {
		setParentId(next);
		if (next === "" && selectedScope.scopeKind === "user") {
			const fallback =
				(hasTeam ? SCOPE_CREATE_OPTIONS.find((o) => o.scopeKind === "team") : undefined) ??
				defaultScope;
			setSelectedScope(fallback);
			setScopeId(fallback.scopeKind === "team" ? (user?.teamId ?? "") : "");
		}
	};

	return (
		<PageScaffold
			frame="page"
			data-testid="document-create-page"
			header={
				<PageHeader
					leading={
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
			<div
				className="max-w-[960px] w-full py-[24px] flex gap-[24px] items-stretch min-h-[calc(100svh-7rem)]"
				data-testid="document-create-body"
			>
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

				<aside className="shrink-0 flex flex-col gap-[12px]" style={{ width: "240px" }}>
					<div
						className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[12px]"
						data-testid="document-create-metadata"
					>
						<div className="flex flex-col gap-[6px]">
							<span className="type-label   uppercase  text-[var(--text-tertiary)]">Scope</span>
							<ScopePicker
								options={SCOPE_CREATE_OPTIONS.map((option) => ({
									id: option.id,
									label: option.label,
									disabled:
										submitting ||
										(option.id === "team" && !hasTeam) ||
										(option.id === "private" && !hasParentChosen),
								}))}
								value={selectedScope.id}
								onChange={(id) => {
									const next = SCOPE_CREATE_OPTIONS.find((o) => o.id === id);
									if (next) {
										// @lore: scope narrowing — narrower scope may invalidate parent; reset parent on narrowing; widening never invalidates
										if (scopeRank(next.scopeKind) < scopeRank(selectedScope.scopeKind)) {
											setParentId("");
										}
										setSelectedScope(next);
										setScopeId("");
									}
								}}
								ariaLabel="Scope"
								testIdPrefix="scope-pill-create"
								disabledTitle={disabledReasons.join(" ")}
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
						<Input
							label="Discipline"
							type="text"
							placeholder="e.g. design (optional)"
							value={discipline}
							onChange={(e) => setDiscipline(e.target.value)}
							disabled={submitting}
						/>
						<ParentPicker
							value={parentId}
							onChange={handleParentChange}
							childScopeKind={selectedScope.scopeKind}
							disabled={submitting}
						/>
					</div>
				</aside>
			</div>
		</PageScaffold>
	);
}
