/**
 * Document/Detail page — metadata bar, markdown body, discussion, children
 * and backlinks. Edit mode is a React state toggle, NOT a route.
 *
 * @lore BC4: replaces `KnowledgeDetail`. Data comes from one door,
 * `useDocument` (`call("open_document", { id })`), kept live by the
 * `document:<id>` websocket nudge — architecture.md §9. The four hand-copied
 * fixture fallbacks (`LEGACY_DETAILS`/`LEGACY_SOURCES`/`FALLBACK_DETAIL`/the
 * `fixtures/knowledge-data.ts` import) are deleted, not adapted: with
 * nothing returned the page shows an honest not-found state. A production
 * file may never import a development file, and a fixture lookup standing
 * in for a real fetch is exactly that.
 *
 * @lore BC4 §4.1: the three mutating controls (Move, Change scope, Archive)
 * run the same pure `editDocumentInvariants` the server runs first, so a
 * doomed edit greys its control with the invariant's own message before the
 * round trip — never a silent 400 after the fact.
 */
import type {
	ActionResult,
	DocumentRow,
	DocumentSlot,
	DocumentView,
	Message,
	ThreadView,
} from "@hyperidle/domain-model";
import { DOCUMENT_STATUS_LABEL, editDocumentInvariants } from "@hyperidle/domain-model";
import { type JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link as RRLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { AssistantContext } from "../contexts/AssistantContext.js";
import type { BreadcrumbSegment, MenuItem } from "../ds";
import {
	BlockActionsPopover,
	BodyEditor,
	Breadcrumb,
	Button,
	documentStatusToStatus,
	EmptyState,
	ErrorState,
	Menu,
	PageHeader,
	PageScaffold,
	SectionLabel,
	SkeletonCard,
	StatusChip,
} from "../ds";
import { useAutoSave } from "../hooks/useAutoSave.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useDocument } from "../hooks/useDocument.js";
import { useTeams } from "../hooks/useTeams.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { call } from "../services/call.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { absoluteDateTime, relativeShort } from "../utils/time.js";

import { DocumentBody } from "./document/DocumentBody.js";
import { MoveDialog } from "./document/MoveDialog.js";
import { ScopeChangeDialog } from "./document/ScopeChangeDialog.js";

const NO_CALLER = { hasCallingTask: false, hasCallingThread: false } as const;

function formatUsageTime(iso: string | null): string {
	return iso ? relativeShort(iso) : "never";
}

/**
 * ChildrenCard — this document's own children (root-first, `position` order,
 * from `DocumentView.children`).
 */
function ChildrenCard({
	items,
	parentId,
}: {
	items: ReadonlyArray<DocumentRow>;
	parentId: string;
}): JSX.Element {
	return (
		<div
			data-testid="document-children-card"
			className="bg-[var(--surface-page)] rounded-[var(--r-default)] overflow-hidden"
		>
			<div className="px-[18px] pt-[18px] pb-[9px] flex items-center justify-between gap-[12px]">
				<SectionLabel label="Children" as="h2" />
				<RRLink
					to={`/documents/new?parentId=${parentId}`}
					className="type-metadata shrink-0 min-h-[44px] inline-flex items-center text-[var(--accent-deep)] hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
					data-testid="document-add-child"
				>
					Add child
				</RRLink>
			</div>
			{items.length === 0 ? (
				<div className="px-[18px] pb-[18px]">
					<p className="type-metadata text-[var(--text-tertiary)]">
						No nested documents yet. Nest related documents under this one.
					</p>
				</div>
			) : (
				<ul className="flex flex-col pb-[9px]">
					{items.map((child) => (
						<li
							key={child.id}
							data-testid="document-child-item"
							className="border-width-thin-t border-[var(--border-subtle)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_4%,var(--surface-elevated))]"
						>
							<RRLink
								to={`/documents/${child.id}`}
								className="type-control flex items-center min-h-[44px] px-[18px] py-[9px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
							>
								{child.title}
							</RRLink>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** Backlinks card — siblings (same parent, this document excluded). */
function BacklinksCard({ siblings }: { siblings: ReadonlyArray<DocumentRow> }): JSX.Element {
	return (
		<div
			data-testid="document-backlinks-card"
			className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px]"
		>
			<SectionLabel label="Backlinks" as="h2" />
			{siblings.length > 0 ? (
				<ul className="flex flex-col">
					{siblings.map((sibling) => (
						<li key={sibling.id} data-testid="related-item">
							<RRLink
								to={`/documents/${sibling.id}`}
								className="type-control flex items-center gap-[9px] py-[6px]  text-[var(--accent-deep)] hover:underline cursor-pointer"
							>
								{sibling.title}
							</RRLink>
						</li>
					))}
				</ul>
			) : (
				<EmptyState
					compact
					title="No backlinks"
					description="Related documents will appear here."
				/>
			)}
		</div>
	);
}

/** Overflow menu ("···") for non-edit-mode actions. */
function DocumentOverflowMenu({
	overflowOpen,
	onToggle,
	onClose,
	onArchive,
	onChangeScope,
	onMove,
	onPromoteToTask,
	archiving,
	itemStatus,
	isReadOnly,
	moveReason,
	scopeReason,
	archiveReason,
}: {
	overflowOpen: boolean;
	onToggle: () => void;
	onClose: () => void;
	onArchive: () => void;
	onChangeScope: () => void;
	onMove: () => void;
	onPromoteToTask: () => void;
	archiving: boolean;
	itemStatus: string;
	isReadOnly: boolean;
	/** Set when a pure invariant would refuse the move — greys the item with its reason. */
	moveReason: string | null;
	/** Set when a pure invariant would refuse the scope change — greys the item with its reason. */
	scopeReason: string | null;
	/** Set when a pure invariant would refuse the archive — greys the item with its reason. */
	archiveReason: string | null;
}): JSX.Element {
	const changeScopeItem: MenuItem = {
		id: "change-scope",
		label: "Change scope",
		onSelect: onChangeScope,
		disabled: scopeReason !== null,
		dataAttrs: {
			"data-testid": "document-change-scope",
			...(scopeReason ? { title: scopeReason } : {}),
		},
	};

	const moveItem: MenuItem = {
		id: "move",
		label: "Move",
		onSelect: onMove,
		disabled: moveReason !== null,
		dataAttrs: {
			"data-testid": "document-move",
			...(moveReason ? { title: moveReason } : {}),
		},
	};

	const items: MenuItem[] = [
		{
			id: "archive",
			label: archiving ? "Archiving…" : "Archive",
			onSelect: onArchive,
			disabled: archiving || archiveReason !== null,
			dataAttrs: {
				"data-testid": "document-archive",
				...(archiveReason ? { title: archiveReason } : {}),
			},
		},
		{
			id: "promote-task",
			label: "Promote to task",
			onSelect: onPromoteToTask,
			disabled: itemStatus === "archived",
			dataAttrs: { "data-testid": "document-promote-task" },
		},
		...(isReadOnly ? [] : [changeScopeItem, moveItem]),
	];

	return (
		<div className="relative">
			<button
				type="button"
				aria-label="More options"
				aria-expanded={overflowOpen}
				aria-haspopup="menu"
				className="border-width-default inline-flex items-center justify-center w-[32px] h-[32px] min-h-[44px] min-w-[44px] xl:min-h-[32px] xl:min-w-[32px] rounded-[var(--r-pill)] border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent-deep)] hover:text-[var(--text-primary)]"
				onClick={onToggle}
			>
				<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[16px] w-[16px]">
					<circle cx="3" cy="8" r="1" fill="currentColor" />
					<circle cx="8" cy="8" r="1" fill="currentColor" />
					<circle cx="13" cy="8" r="1" fill="currentColor" />
				</svg>
			</button>
			{overflowOpen && (
				<div data-testid="document-overflow-menu">
					<Menu
						open={overflowOpen}
						onClose={onClose}
						label="Document actions"
						align="end"
						items={items}
					/>
				</div>
			)}
		</div>
	);
}

/** Save indicator shown in edit mode */
function SaveIndicator({ saveStatus }: { saveStatus: string }): JSX.Element {
	return (
		<span
			className="type-metadata  text-[var(--status-success)] flex items-center gap-[3px]"
			aria-live="polite"
			data-testid="save-indicator"
			data-save-status={saveStatus}
		>
			{saveStatus === "saving" && "Saving..."}
			{saveStatus === "saved" && (
				<>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
						<path
							d="M2 6l3 3 5-5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					Saved
				</>
			)}
			{saveStatus === "error" && <span className="text-[var(--status-error)]">Save failed</span>}
		</span>
	);
}

export interface DocumentDetailProps {
	/** Override the document id resolved from route params — used by design system stories. */
	overrideDocumentId?: string;
	overrideHash?: string;
	presentation?: "page" | "pane";
}

export function DocumentDetail({
	overrideDocumentId,
	overrideHash,
	presentation = "page",
}: DocumentDetailProps = {}): JSX.Element {
	const { documentId: routeDocumentId } = useParams<{ documentId: string }>();
	const documentId = overrideDocumentId ?? routeDocumentId;
	const { status, data, error, refresh } = useDocument(documentId);

	if (status === "loading" || status === "idle") {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Document" />}>
				<div className="flex flex-col gap-[12px] p-[24px]">
					<SkeletonCard ariaLabel="Loading document" />
					<SkeletonCard ariaLabel="Loading document body" />
				</div>
			</PageScaffold>
		);
	}

	if (status === "error") {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Document" />}
				data-testid="document-page-error"
			>
				<div className="p-[24px]">
					<ErrorState
						title="Failed to load document"
						description={error ?? "Something went wrong."}
						onRetry={refresh}
						dataTestId="document-error-state"
					/>
				</div>
			</PageScaffold>
		);
	}

	if (status === "not-found" || !data) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Document" />}
				data-testid="document-detail-page"
			>
				<div className="p-[24px]">
					<EmptyState
						title="Document not found"
						description="This document does not exist, or you don't have access to it."
					/>
				</div>
			</PageScaffold>
		);
	}

	return (
		<DocumentDetailView
			key={data.document.id}
			view={data}
			overrideHash={overrideHash}
			presentation={presentation}
			refresh={refresh}
		/>
	);
}

interface DocumentDetailViewProps {
	view: DocumentView;
	overrideHash?: string;
	presentation?: "page" | "pane";
	refresh: () => void;
}

function DocumentDetailView({
	view,
	overrideHash,
	presentation = "page",
	refresh,
}: DocumentDetailViewProps): JSX.Element {
	const { document, ancestors, children, siblings, scopeName } = view;
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();
	const { overlayOpen, attachContext } = useContext(AssistantContext);
	const isFactory = document.scopeKind === "factory";
	const [savedContent, setSavedContent] = useState<string>(document.body);
	const [editing, setEditing] = useState(false);
	const [editContent, setEditContent] = useState<string>(document.body);

	// Block-anchored scroll: read hash → parse #block-<id> → scroll to it.
	// @lore security — blockId is matched by VALUE comparison against
	// data-block-id attributes, never concatenated into a querySelector string.
	const { hash: routeHash } = useLocation();
	const hash = overrideHash ?? routeHash;
	// biome-ignore lint/correctness/useExhaustiveDependencies: savedContent triggers re-scroll after content changes (blocks re-render with new data-block-id attrs)
	useEffect(() => {
		if (!hash.startsWith("#block-")) return;
		const decoded = decodeURIComponent(hash.slice("#block-".length));
		if (!decoded) return;
		const raf = requestAnimationFrame(() => {
			const el = Array.from(window.document.querySelectorAll("[data-block-id]")).find(
				(node) => node.getAttribute("data-block-id") === decoded,
			);
			(el as HTMLElement | undefined)?.scrollIntoView?.({ block: "start" });
		});
		return () => cancelAnimationFrame(raf);
	}, [hash, savedContent]);

	const [scopeChangeOpen, setScopeChangeOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const [archiving, setArchiving] = useState(false);
	const [archiveError, setArchiveError] = useState<string | null>(null);
	const [promoteError, setPromoteError] = useState<string | null>(null);

	const useTeamsResult = useTeams();
	const teamsData = useTeamsResult?.data ?? null;

	const [overflowOpen, setOverflowOpen] = useState(false);
	const closeOverflow = useCallback((): void => setOverflowOpen(false), []);

	const [openBlockId, setOpenBlockId] = useState<string | null>(null);
	const [threadPrefill, setThreadPrefill] = useState<
		{ blockId: string; blockExcerpt: string } | undefined
	>(undefined);
	const [threadView, setThreadView] = useState<ThreadView | null>(null);

	const [version, setVersion] = useState<number>(document.version);
	const [conflictMessage, setConflictMessage] = useState<string | null>(null);

	const latestContentRef = useRef<string>("");
	const { user } = useCurrentUser();

	// Self-authored factory items are editable; agent-authored factory
	// items remain read-only. Client-side UI policy — not a §4.1 invariant.
	const isSelfAuthoredFactory = isFactory && user !== null && document.updatedBy === user.id;
	const isReadOnly = isFactory && !isSelfAuthoredFactory;

	const saveDocument = useCallback(
		(content: string): Promise<ActionResult<DocumentView>> =>
			call("edit_document", { id: document.id, body: content, version }),
		[document.id, version],
	);

	const { status: saveStatus, save: triggerSave } = useAutoSave<DocumentView>({
		save: saveDocument,
		onSaved: (savedView) => {
			setVersion(savedView.document.version);
			setSavedContent(latestContentRef.current);
		},
		onConflict: (problems) => setConflictMessage(problems[0]?.message ?? null),
	});

	// §4.1 — the same pure invariants the server runs first, so a doomed
	// control greys itself with the invariant's own reason before the round
	// trip. A stable non-self probe target is enough: I10/I4 don't depend on
	// which document is named, only on this document's own slot/`as`.
	const moveReason = useMemo(() => {
		const problems = editDocumentInvariants(
			{ id: document.id, parent: { kind: "document", id: `${document.id}-probe` } },
			document,
			NO_CALLER,
		);
		return problems[0]?.message ?? null;
	}, [document]);

	const scopeReason = useMemo(() => {
		const problems = editDocumentInvariants(
			{ id: document.id, scopeKind: "team", scopeId: `${document.id}-probe` },
			document,
			NO_CALLER,
		);
		return problems[0]?.message ?? null;
	}, [document]);

	const archiveReason = useMemo(() => {
		const problems = editDocumentInvariants(
			{ id: document.id, status: "archived" },
			document,
			NO_CALLER,
		);
		return problems[0]?.message ?? null;
	}, [document]);

	const messagesByBlockId = useMemo((): ReadonlyMap<string, ReadonlyArray<Message>> => {
		const map = new Map<string, Message[]>();
		if (!threadView?.messages) return map;
		for (const msg of threadView.messages) {
			if (msg.type !== "plain" || msg.blockId === null) continue;
			const existing = map.get(msg.blockId) ?? [];
			map.set(msg.blockId, [...existing, msg]);
		}
		return map;
	}, [threadView?.messages]);

	function startEdit(): void {
		latestContentRef.current = savedContent;
		setEditContent(savedContent);
		setEditing(true);
		setConflictMessage(null);
	}

	function exitEdit(): void {
		setEditing(false);
	}

	function handleContentChange(markdown: string): void {
		latestContentRef.current = markdown;
		if (markdown === editContent) return;
		triggerSave(markdown);
	}

	async function handleArchive(): Promise<void> {
		closeOverflow();
		setArchiving(true);
		setArchiveError(null);
		const result = await call("edit_document", { id: document.id, status: "archived", version });
		setArchiving(false);
		if (result.ok) {
			navigate("/documents");
		} else {
			setArchiveError(result.problems[0]?.message ?? "Archive failed");
		}
	}

	async function handlePromoteToTask(): Promise<void> {
		closeOverflow();
		const teams = teamsData?.teams ?? [];
		const singleTeam = teams.length === 1;

		if (!singleTeam) {
			navigate(`/work/task/new?fromDocument=${encodeURIComponent(document.id)}`);
			return;
		}

		const teamId = teams[0]?.id ?? "";
		if (!teamId) return;

		setPromoteError(null);
		try {
			const result = await call("edit_task", {
				teamId,
				title: document.title,
				description: savedContent || document.body,
				sourceDocumentId: document.id,
			});
			if (result.ok) {
				navigate(`/work/task/${result.data.task.id}`);
			} else {
				setPromoteError(result.problems[0]?.message ?? "Promote failed");
			}
		} catch {
			setPromoteError("Promote failed: network error");
		}
	}

	function handleDiscussBlock(blockId: string): void {
		const blockEl = window.document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		setThreadPrefill({ blockId, blockExcerpt });
		setOpenBlockId(null);
	}

	function handleShareBlock(blockId: string): void {
		const blockEl = window.document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		attachContext({ kind: "pending_block", content: rawText, label: blockExcerpt });
		setOpenBlockId(null);
	}

	const slotLabel: DocumentSlot | null = document.slot !== "ordinary" ? document.slot : null;

	// Non-empty by construction: the "Knowledge" root and the current
	// document always exist; ancestors spread in between (root-first).
	const breadcrumbSegments: readonly [BreadcrumbSegment, ...BreadcrumbSegment[]] = [
		{ label: "Knowledge", to: "/documents" },
		...ancestors.map((a) => ({ label: a.title, to: `/documents/${a.id}` })),
		{ label: document.title },
	];

	return (
		<PageScaffold
			frame={presentation === "page" ? "page" : "local"}
			data-testid="document-detail-page"
			header={
				<PageHeader
					presentation={presentation}
					reservePaneControls={presentation === "pane"}
					title={document.title}
					leading={
						<Breadcrumb
							segments={breadcrumbSegments}
							leading={
								!sidebarMobile ? (
									<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
								) : undefined
							}
							LinkComponent={RRLink}
						/>
					}
					subtitle={
						<div
							className="flex items-center gap-[6px] flex-wrap"
							data-testid="document-metadata-bar"
						>
							<StatusChip status={documentStatusToStatus(document.status)} />
							{slotLabel && (
								<span
									className="type-metadata  text-[var(--text-tertiary)]"
									data-testid="document-slot"
								>
									{slotLabel}
								</span>
							)}
							<span
								className="type-metadata  text-[var(--text-tertiary)]"
								data-testid="document-updated-at"
							>
								{absoluteDateTime(document.updatedAt)}
							</span>
						</div>
					}
					actions={
						<div className="flex items-center gap-[6px]">
							{editing && <SaveIndicator saveStatus={saveStatus} />}
							{!(editing || isReadOnly) ? (
								<Button variant="primary" size="sm" onClick={startEdit}>
									Edit
								</Button>
							) : editing ? (
								<Button
									variant="primary"
									size="sm"
									onClick={exitEdit}
									disabled={
										saveStatus === "saving" || saveStatus === "error" || saveStatus === "conflict"
									}
								>
									Done
								</Button>
							) : null}
							{!editing && (
								<DocumentOverflowMenu
									overflowOpen={overflowOpen}
									onToggle={() => setOverflowOpen((prev) => !prev)}
									onClose={closeOverflow}
									onArchive={() => void handleArchive()}
									onChangeScope={() => {
										setScopeChangeOpen(true);
										closeOverflow();
									}}
									onMove={() => {
										setMoveOpen(true);
										closeOverflow();
									}}
									onPromoteToTask={() => void handlePromoteToTask()}
									archiving={archiving}
									itemStatus={document.status}
									isReadOnly={isReadOnly}
									moveReason={moveReason}
									scopeReason={scopeReason}
									archiveReason={archiveReason}
								/>
							)}
						</div>
					}
				/>
			}
		>
			<div
				className={
					presentation === "page"
						? "flex flex-col md:flex-row gap-[24px] py-[24px] max-w-[960px] w-full"
						: "flex flex-col md:flex-row gap-[24px] p-[18px] w-full"
				}
			>
				<div className="flex flex-col gap-[24px] flex-1 min-w-0">
					{archiveError !== null && (
						<div
							role="alert"
							className="type-small border-width-thin flex items-center justify-between gap-[9px] px-[12px] py-[9px]  bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)]  border-[var(--border-subtle)] rounded-[var(--r-subtle)]"
							data-testid="archive-error"
						>
							<span className="text-[var(--status-error)]">{archiveError}</span>
							<button
								type="button"
								className="type-control  text-[var(--text-tertiary)] bg-transparent border-none cursor-pointer"
								onClick={() => setArchiveError(null)}
							>
								Dismiss
							</button>
						</div>
					)}

					{promoteError !== null && (
						<div
							role="alert"
							className="type-small border-width-thin flex items-center justify-between gap-[9px] px-[12px] py-[9px]  bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)]  border-[var(--border-subtle)] rounded-[var(--r-subtle)]"
							data-testid="promote-error"
						>
							<span className="text-[var(--status-error)]">{promoteError}</span>
							<button
								type="button"
								className="type-control  text-[var(--text-tertiary)] bg-transparent border-none cursor-pointer"
								onClick={() => setPromoteError(null)}
							>
								Dismiss
							</button>
						</div>
					)}

					{/* §4.2 D7 — the version-clash banner: `edit_document` refused the
					    save because the document changed since it was opened. The
					    editor text is NEVER overwritten from this — Reload is explicit. */}
					{conflictMessage !== null && (
						<div
							role="alert"
							className="type-small border-width-thin flex items-center justify-between gap-[9px] px-[12px] py-[9px] bg-[var(--surface-container)] border-[var(--border-subtle)] rounded-[var(--r-subtle)]"
							data-testid="conflict-banner"
						>
							<span className="text-[var(--text-secondary)]">{conflictMessage}</span>
							<Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
								Reload
							</Button>
						</div>
					)}

					{openBlockId !== null && (
						<BlockActionsPopover
							id={`block-popover-document-${openBlockId}`}
							open
							onClose={() => setOpenBlockId(null)}
							liveRegionId="block-popover-document-live"
							items={[
								{
									id: "discuss-block",
									label: "Discuss",
									onSelect: () => handleDiscussBlock(openBlockId),
								},
								...(overlayOpen
									? [
											{
												id: "share-block",
												label: "Share",
												onSelect: () => handleShareBlock(openBlockId),
											},
										]
									: []),
							]}
						/>
					)}

					{editing ? (
						<div className="flex flex-col gap-[12px]" data-testid="document-edit-panel">
							<BodyEditor
								initialContent={editContent}
								onChange={handleContentChange}
								placeholder="Start writing..."
								autoFocus
								minHeight="200px"
								variant="full"
							/>
						</div>
					) : (
						<DocumentBody
							body={savedContent}
							hostId={document.id}
							documentTitle={document.title}
							onOpenBlockActions={(blockId) => setOpenBlockId(blockId)}
							messagesByBlockId={messagesByBlockId}
						/>
					)}
					<HostThreadSection
						host={{ kind: "document", id: document.id }}
						title="Discussion"
						prefill={threadPrefill}
						onClearPrefill={() => setThreadPrefill(undefined)}
						filterBlockId={threadPrefill?.blockId}
						onThreadView={setThreadView}
					/>
				</div>

				<aside
					data-testid="document-metadata-aside"
					className="w-full md:w-[240px] shrink-0 flex flex-col gap-[18px]"
					aria-label="Document metadata"
				>
					<ScopeChangeDialog
						open={scopeChangeOpen}
						onClose={() => setScopeChangeOpen(false)}
						onSaved={() => {
							setScopeChangeOpen(false);
							refresh();
						}}
						documentId={document.id}
						currentVersion={document.version}
						currentScopeKind={document.scopeKind}
					/>

					{/* A move changes the tree shape the whole page renders
					    (breadcrumb, Children/Backlinks); a full reload is the same
					    choice the conflict banner's own Reload button already makes. */}
					<MoveDialog
						open={moveOpen}
						onClose={() => setMoveOpen(false)}
						onSaved={() => window.location.reload()}
						documentId={document.id}
						currentVersion={document.version}
						currentParentId={document.parentId}
						currentParentKind={document.parentKind}
						scopeKind={document.scopeKind}
					/>

					<div className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px]">
						<SectionLabel label="Metadata" as="h2" />
						<div
							className="type-small border-width-thin-b flex justify-between items-center py-[6px]  border-[var(--border-subtle)] "
							data-testid="document-scope-row"
						>
							<span className="text-[var(--text-tertiary)]">Scope</span>
							<span className="flex items-center gap-[6px]">
								<span className="type-small text-[var(--text-primary)] ">{scopeName}</span>
								{!isReadOnly ? (
									<Button
										variant="ghost"
										size="sm"
										data-testid="document-scope-change-trigger"
										disabled={scopeReason !== null}
										title={scopeReason ?? undefined}
										onClick={() => setScopeChangeOpen(true)}
									>
										Change
									</Button>
								) : (
									<span
										className="type-metadata  text-[var(--text-tertiary)]"
										data-testid="document-scope-readonly"
									>
										Read-only
									</span>
								)}
							</span>
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Status</span>
							<StatusChip
								status={documentStatusToStatus(document.status)}
								label={DOCUMENT_STATUS_LABEL[document.status]}
							/>
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Last edited</span>
							<span className="type-small text-[var(--text-primary)] ">
								{absoluteDateTime(document.updatedAt)}
							</span>
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Editor</span>
							{document.updatedBy === user?.id ? (
								<span className="type-small text-[var(--text-primary)] ">{user.name}</span>
							) : (
								<span className="type-small text-[var(--text-primary)] ">Another editor</span>
							)}
						</div>
						{/* §6.7 — the four usage values. Existing aside, no new component. */}
						<div
							className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] "
							data-testid="document-read-count-row"
						>
							<span className="text-[var(--text-tertiary)]">Read</span>
							<span
								className="type-data text-[var(--text-primary)] tabular-nums"
								data-testid="document-read-count"
							>
								{document.readCount} · {formatUsageTime(document.lastReadAt)}
							</span>
						</div>
						<div
							className="type-small flex justify-between items-center py-[6px]"
							data-testid="document-session-use-count-row"
						>
							<span className="text-[var(--text-tertiary)]">Sessions</span>
							<span
								className="type-data text-[var(--text-primary)] tabular-nums"
								data-testid="document-session-use-count"
							>
								{document.sessionUseCount} · {formatUsageTime(document.lastUsedAt)}
							</span>
						</div>
					</div>

					<ChildrenCard items={children} parentId={document.id} />
					<BacklinksCard siblings={siblings} />
				</aside>
			</div>
		</PageScaffold>
	);
}
