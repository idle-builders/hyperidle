// @lore: tab memory — Triage/Curated stays in component state only; localStorage persistence explicitly forbidden
// @lore: Memories — filter chip, not a page; toggles between {inTree:true} and {as:"memory"} filter; Curated tab is a nestable tree (DocumentTreeList)

import type { DocumentRow, DocumentStatus, SearchDocumentsInput } from "@hyperidle/domain-model";
import { DOCUMENT_STATUS_LABEL } from "@hyperidle/domain-model";
import {
	Button,
	documentStatusToStatus,
	EmptyState,
	ErrorState,
	ItemList,
	PageHeader,
	PageScaffold,
	Row,
	type RowCell,
	ScopePicker,
	ScopePickerToggle,
	SkeletonList,
	StatusChip,
	TabBar,
} from "../ds";

// @lore: VISIBLE_SORT_OPTIONS — recency only; sort is client-side re-sort of fetched page; server's own sort param is never sent
const VISIBLE_SORT_OPTIONS = ["recency"] as const;
type DocumentSortOption = (typeof VISIBLE_SORT_OPTIONS)[number];

import { type JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useDocuments } from "../hooks/useDocuments.js";
import type { AppShellOutletContext } from "../layouts/AppShell.js";
import { call } from "../services/call.js";
import { ToastContext } from "../shell/ToastRegion.js";
import { clipExcerpt } from "../utils/clip-excerpt.js";
import { SCOPE_PILL_OPTIONS, type ScopePillOption } from "../utils/scope-labels";
import { stripMarkdown } from "../utils/strip-markdown.js";
import { relativeShort } from "../utils/time.js";
import { buildDocumentTree } from "./document/build-document-tree.js";
import { DocumentTreeList } from "./document/DocumentTreeList.js";

type DocumentTab = "triage" | "curated";

export function sortItems(items: readonly DocumentRow[]): DocumentRow[] {
	return [...items].sort((a, b) => {
		const cmp = b.updatedAt.localeCompare(a.updatedAt);
		if (cmp !== 0) return cmp;
		return a.title.localeCompare(b.title);
	});
}

function isDocumentSortOption(value: string | null): value is DocumentSortOption {
	return (VISIBLE_SORT_OPTIONS as readonly string[]).includes(value ?? "");
}

function deriveSort(searchParams: URLSearchParams): DocumentSortOption {
	const raw = searchParams.get("sort");
	return isDocumentSortOption(raw) ? raw : "recency";
}

function triageRowCells(item: DocumentRow): RowCell[] {
	const cells: RowCell[] = [];
	if (item.scopeKind === "user") {
		cells.push({
			content: (
				<span
					className="type-metadata inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)]   whitespace-nowrap"
					style={{
						background: "var(--surface-container)",
						color: "var(--text-secondary)",
					}}
					title="Private — only visible to you"
				>
					Private
				</span>
			),
			"data-testid": "private-badge",
		});
	}
	if (item.status === "active" || item.status === "archived") {
		cells.push({
			content: (
				<span data-testid="status-badge">
					<StatusChip
						status={documentStatusToStatus(item.status)}
						label={DOCUMENT_STATUS_LABEL[item.status]}
					/>
				</span>
			),
		});
	}
	cells.push({ content: relativeShort(item.updatedAt), "data-testid": "document-time" });
	return cells;
}

interface DocumentListContentProps {
	tab: DocumentTab;
	sort: DocumentSortOption;
	/** The currently selected static scope pill option. null = "All". */
	selectedScopePill: ScopePillOption | null;
	onScopePillChange: (pill: ScopePillOption | null) => void;
	onSortChange: (option: DocumentSortOption) => void;
	curatedItems: DocumentRow[];
	triageItems: DocumentRow[];
	apiLoading: boolean;
	apiError: string | null;
	isCuratedEmpty: boolean;
	isTriageEmpty: boolean;
	onNavigate: (id: string) => void;
	searchQuery: string;
	onTriageAction: (itemId: string, newStatus: "active" | "archived") => void;
	onRetry?: () => void;
	onTabChange: (tab: DocumentTab) => void;
	onSearchChange: (query: string) => void;
	onNewItem: () => void;
	/** Navigate to create a child under the given parent item. */
	onNewChild: (parentId: string) => void;
	/** Whether the "Memories" filter chip is active. */
	showMemories: boolean;
	onToggleMemories: () => void;
}

function DocumentListContent({
	tab,
	sort,
	selectedScopePill,
	onScopePillChange,
	onSortChange,
	curatedItems,
	triageItems,
	apiLoading,
	apiError,
	isCuratedEmpty,
	isTriageEmpty,
	onNavigate,
	searchQuery,
	onTriageAction,
	onRetry,
	onTabChange,
	onSearchChange,
	onNewItem,
	onNewChild,
	showMemories,
	onToggleMemories,
}: DocumentListContentProps): JSX.Element {
	const [focusedIndex, setFocusedIndex] = useState<number>(-1);

	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredTriageItems = normalizedQuery
		? triageItems.filter((i) => i.title.toLowerCase().includes(normalizedQuery))
		: triageItems;
	const filteredCuratedItems = normalizedQuery
		? curatedItems.filter((i) => i.title.toLowerCase().includes(normalizedQuery))
		: curatedItems;
	// @lore: curatedTreeRows — Curated tab renders as a tree; each parent immediately followed by its own children, indented
	const curatedTreeRows = useMemo(
		() => buildDocumentTree(filteredCuratedItems),
		[filteredCuratedItems],
	);

	useEffect(() => {
		if (tab !== "triage") return;

		function handleKeyDown(e: KeyboardEvent): void {
			const target = e.target as HTMLElement | null;
			if (target) {
				const tag = target.tagName.toLowerCase();
				if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
			}

			if (e.key === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				setFocusedIndex((prev) => {
					const next = prev + 1;
					return next >= filteredTriageItems.length ? prev : next;
				});
			} else if (e.key === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				setFocusedIndex((prev) => {
					const next = prev - 1;
					return next < 0 ? 0 : next;
				});
			} else if (e.key === "Escape") {
				e.preventDefault();
				setFocusedIndex(-1);
			} else if (e.key === "v") {
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < filteredTriageItems.length) {
					const item = filteredTriageItems[focusedIndex];
					if (item) onTriageAction(item.id, "active");
				}
			} else if (e.key === "x") {
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < filteredTriageItems.length) {
					const item = filteredTriageItems[focusedIndex];
					if (item) onTriageAction(item.id, "archived");
				}
			} else if (e.key === "Enter" || e.key === "o") {
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < filteredTriageItems.length) {
					const item = filteredTriageItems[focusedIndex];
					if (item) onNavigate(item.id);
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [tab, focusedIndex, filteredTriageItems, onTriageAction, onNavigate]);

	useEffect(() => {
		setFocusedIndex((prev) => {
			if (filteredTriageItems.length === 0) return -1;
			if (prev >= filteredTriageItems.length) return filteredTriageItems.length - 1;
			return prev;
		});
	}, [filteredTriageItems.length]);

	return (
		<div className="max-w-[800px] w-full">
			<div className="flex items-center justify-between py-[12px]">
				<TabBar
					tabs={[
						{ id: "curated", label: "Curated" },
						{ id: "triage", label: "Triage" },
					]}
					activeId={tab}
					onChange={(id) => onTabChange(id as DocumentTab)}
					ariaLabel="Document view"
					dataTestId="document-tabs"
				/>
				<div className="flex items-center gap-[9px]">
					<input
						type="search"
						aria-label="Filter documents"
						data-testid="document-search"
						placeholder="Filter…"
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
						style={{
							width: "160px",
							borderRadius: "var(--r-pill)",
							border: "var(--bw-default) solid var(--border-default)",
							padding: "7px 12px",
							background: "var(--surface-page)",
							color: "var(--text-primary)",
							outline: "none",
						}}
						className="type-input hidden sm:inline"
					/>
					<Button variant="primary" size="sm" onClick={onNewItem}>
						+ New
					</Button>
				</div>
			</div>
			<div className="pt-[12px] flex items-center justify-between flex-wrap gap-[9px]">
				<ScopePicker
					mode="filter"
					options={SCOPE_PILL_OPTIONS}
					value={selectedScopePill?.id ?? null}
					onChange={(id) =>
						onScopePillChange(
							id === null ? null : (SCOPE_PILL_OPTIONS.find((p) => p.id === id) ?? null),
						)
					}
					ariaLabel="Filter by scope"
					testIdPrefix="scope-pill"
					dataTestId="document-scope-pills"
				/>
				{/* @lore: Memories toggle — ScopePickerToggle not radiogroup; single-pill radiogroup unchecks on click 2 (screen reader can't turn it off) */}
				<ScopePickerToggle
					label="Memories"
					pressed={showMemories}
					onToggle={onToggleMemories}
					data-testid="memories-filter-chip"
				/>
			</div>

			{/* @lore: sort buttons — explicit role overrides implicit element role; role="radio" buttons not found by getByRole("button") */}
			{/* biome-ignore lint/a11y/useSemanticElements: not a form — a <fieldset> here would be semantically wrong; role="group" is the established compromise. */}
			<div
				role="group"
				aria-label="Sort order"
				data-testid="document-sort-bar"
				className="flex items-center gap-[9px] py-[9px]"
			>
				<span className="type-metadata  text-[var(--text-tertiary)]">Sort:</span>
				{VISIBLE_SORT_OPTIONS.map((option) => {
					const isActive = sort === option;
					return (
						<button
							key={option}
							type="button"
							aria-pressed={isActive}
							onClick={() => onSortChange(option)}
							className={`type-control ${
								isActive
									? " text-[var(--accent-deep)]  cursor-pointer bg-transparent border-none capitalize"
									: " text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none capitalize"
							}`}
						>
							{option}
						</button>
					);
				})}
			</div>

			{tab === "triage" ? (
				// @lore: triage div block — block not flex so sticky resolves to overflow-y-auto scroll container; flex parent has no overflow so sticky never fires
				<div data-testid="document-triage-view">
					{apiLoading ? (
						<div className="py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading triage items" />
						</div>
					) : apiError ? (
						<div className="py-[12px]">
							<ErrorState
								title="Couldn't load documents"
								description={apiError}
								onRetry={onRetry}
							/>
						</div>
					) : isTriageEmpty || filteredTriageItems.length === 0 ? (
						<div className="flex items-center justify-center p-[48px_24px]">
							<EmptyState
								title={normalizedQuery ? "No results" : "Nothing needs attention"}
								description={
									normalizedQuery
										? `No triage items match "${searchQuery}".`
										: "Triage is clear — agents will surface draft items here as they learn."
								}
								dataTestId="document-triage-empty"
							/>
						</div>
					) : (
						<ItemList variant="flush" as="ul" isEmpty={filteredTriageItems.length === 0}>
							{filteredTriageItems.map((item, index) => {
								return (
									<Row
										key={item.id}
										as="li"
										data-testid="document-row"
										data-focused={focusedIndex === index ? "true" : undefined}
										title={item.title}
										subtitle={
											item.body ? clipExcerpt(stripMarkdown(item.body)) || undefined : undefined
										}
										cells={triageRowCells(item)}
										actions={
											<div className="flex items-center gap-[3px]">
												<Button
													variant="ghost"
													tone="neutral"
													size="icon"
													aria-label="Validate"
													title="Validate"
													onClick={(e) => {
														e.stopPropagation();
														onTriageAction(item.id, "active");
													}}
												>
													<svg
														width="14"
														height="14"
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
														aria-hidden="true"
													>
														<path d="M2 8l4 4 8-8" />
													</svg>
												</Button>
												<Button
													variant="ghost"
													tone="neutral"
													size="icon"
													aria-label="Reject"
													title="Reject"
													onClick={(e) => {
														e.stopPropagation();
														onTriageAction(item.id, "archived");
													}}
												>
													<svg
														width="14"
														height="14"
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
														aria-hidden="true"
													>
														<path d="M2 2l12 12M14 2L2 14" />
													</svg>
												</Button>
												<Button
													variant="ghost"
													tone="neutral"
													size="icon"
													aria-label="Open"
													title="Open"
													onClick={(e) => {
														e.stopPropagation();
														onNavigate(item.id);
													}}
												>
													<svg
														width="14"
														height="14"
														viewBox="0 0 16 16"
														fill="none"
														stroke="currentColor"
														strokeWidth="2"
														strokeLinecap="round"
														strokeLinejoin="round"
														aria-hidden="true"
													>
														<path d="M3 8h10M8 3l5 5-5 5" />
													</svg>
												</Button>
											</div>
										}
										onClick={() => onNavigate(item.id)}
									/>
								);
							})}
						</ItemList>
					)}
				</div>
			) : (
				<div className="flex flex-col" data-testid="document-curated-view">
					{apiLoading ? (
						<div className="py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading curated items" />
						</div>
					) : apiError ? (
						<div className="py-[12px]">
							<ErrorState
								title="Couldn't load documents"
								description={apiError}
								onRetry={onRetry}
							/>
						</div>
					) : isCuratedEmpty ? (
						<div className="flex items-center justify-center p-[48px_24px]">
							<EmptyState
								title="No documents yet"
								description="Agents will populate this scope as they learn. Check back after the next review cycle."
								dataTestId="document-curated-empty"
							/>
						</div>
					) : (
						<DocumentTreeList
							rows={curatedTreeRows}
							onNavigate={onNavigate}
							onNewChild={onNewChild}
						/>
					)}
				</div>
			)}
		</div>
	);
}

export interface DocumentListProps {
	loading?: boolean;
	error?: { message: string; onRetry?: () => void } | null;
}

export function DocumentList({
	loading = false,
	error = null,
}: DocumentListProps = {}): JSX.Element {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const sort = deriveSort(searchParams);
	// @lore: outletCtx — optional; gracefully absent in story/test contexts without an AppShell outlet
	const outletCtx = useOutletContext<AppShellOutletContext | null>();
	// @lore: ToastContext direct read — not useToast; renders in tests/Storybook without a <ToastRegion> ancestor
	const toast = useContext(ToastContext);

	const [tab, setTab] = useState<DocumentTab>("triage");
	const tabManuallySelectedRef = useRef(false);
	const [selectedScopePill, setSelectedScopePill] = useState<ScopePillOption | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [showMemories, setShowMemories] = useState(false);
	// @lore: optimisticStatuses Map — overrides applied before triage/curated split; departure from Triage and arrival in Curated both happen in one render
	const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, "active" | "archived">>(
		new Map(),
	);

	const documentsFilter: SearchDocumentsInput = showMemories ? { as: "memory" } : { inTree: true };
	const {
		documents: apiDocuments,
		status: apiStatus,
		error: apiErrorMessage,
		retry: apiRetry,
	} = useDocuments(documentsFilter);
	const apiLoading = apiStatus === "loading";
	const apiError = apiStatus === "error" ? apiErrorMessage : null;

	// @lore: handleRetry — retries both document and shell fetches; without shell retry, sidebar stays in error after outage+restart even when main content loads
	const handleRetry = useCallback((): void => {
		apiRetry();
		outletCtx?.onRetryShell?.();
	}, [apiRetry, outletCtx]);

	// @lore: allItems filter — server excludes non-document parents via inTree:true; client duplicates check to express contract in code, not just server dependency
	const allItems = useMemo<DocumentRow[]>(
		() =>
			apiDocuments.filter(
				(item) =>
					item.parentKind === null ||
					item.parentKind === undefined ||
					item.parentKind === "document",
			),
		[apiDocuments],
	);

	const scopeFilteredItems = useMemo<DocumentRow[]>(() => {
		const withOverrides: DocumentRow[] =
			optimisticStatuses.size > 0
				? allItems.map((i) => {
						const override = optimisticStatuses.get(i.id);
						return override !== undefined ? { ...i, status: override as DocumentStatus } : i;
					})
				: allItems;
		if (selectedScopePill === null || selectedScopePill.filterKinds === null) return withOverrides;
		const allowed = new Set<string>(selectedScopePill.filterKinds);
		return withOverrides.filter((i) => allowed.has(i.scopeKind));
	}, [allItems, selectedScopePill, optimisticStatuses]);

	// @lore: triage split — proposed status → triage; active → curated; triage sorted by recency only
	const triageItems = useMemo<DocumentRow[]>(() => {
		const raw = scopeFilteredItems.filter((i) => i.status === "proposed");
		return sortItems(raw);
	}, [scopeFilteredItems]);

	const curatedItems = useMemo<DocumentRow[]>(() => {
		const raw = scopeFilteredItems.filter((i) => i.status === "active");
		return sortItems(raw);
	}, [scopeFilteredItems]);

	useEffect(() => {
		if (tabManuallySelectedRef.current) return;
		const hasTriage = allItems.some((i) => i.status === "proposed");
		setTab(hasTriage ? "triage" : "curated");
	}, [allItems]);

	// @lore: handleTriageAction version — item.version prevents stale write at version 2+; on API refusal, optimistic override cleared so item reappears in triage
	function handleTriageAction(itemId: string, newStatus: "active" | "archived"): void {
		const item = allItems.find((i) => i.id === itemId);
		const version = item?.version;

		setOptimisticStatuses((prev) => new Map([...prev, [itemId, newStatus]]));

		void (async (): Promise<void> => {
			const revert = (): void => {
				setOptimisticStatuses((prev) => {
					const next = new Map(prev);
					next.delete(itemId);
					return next;
				});
			};
			try {
				const result = await call("edit_document", { id: itemId, status: newStatus, version });
				if (!result.ok) {
					revert();
					toast?.showToast(result.problems[0]?.message ?? "Failed to update the document");
				}
			} catch {
				// Network error — revert so the user can retry
				revert();
				toast?.showToast("Network error");
			}
		})();
	}

	function handleSortChange(newSort: DocumentSortOption): void {
		const next = new URLSearchParams(searchParams);
		next.set("sort", newSort);
		setSearchParams(next, { replace: true });
	}

	function handleTabChange(newTab: DocumentTab): void {
		tabManuallySelectedRef.current = true;
		setTab(newTab);
	}

	if (loading) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Documents" />}
				data-testid="document-list-page"
			>
				<SkeletonList rows={6} ariaLabel="Loading documents" />
			</PageScaffold>
		);
	}

	if (error) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Documents" />}
				data-testid="document-list-page"
			>
				<ErrorState
					title="Couldn't load documents"
					description={error.message}
					onRetry={error.onRetry}
				/>
			</PageScaffold>
		);
	}

	// @lore: systemEmpty — only when no API error; 500/429 must surface as ErrorState+retry, not empty state
	const systemEmpty = allItems.length === 0 && !apiLoading && !apiError;
	const isCuratedEmpty = curatedItems.length === 0 && !apiLoading;
	const isTriageEmpty = triageItems.length === 0 && !apiLoading;

	return (
		<PageScaffold
			frame="page"
			data-testid="document-list-page"
			header={
				<PageHeader
					title={
						<>
							<span className="sr-only">Document Library</span>
							Documents
						</>
					}
				/>
			}
		>
			{systemEmpty ? (
				<div className="flex items-center justify-center p-[48px_24px] h-full">
					<EmptyState
						title="Your document library is empty"
						description="Documents capture patterns, decisions, and lessons learned. As your agents work, they will start indexing insights here automatically. You can also add documents manually."
						icon={
							<svg
								width="24"
								height="24"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
								<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
							</svg>
						}
						iconBg="rgba(46,125,186,0.08)"
						action={
							<Button variant="primary" onClick={() => navigate("/documents/new")}>
								Create first document
							</Button>
						}
						dataTestId="document-curated-empty"
					/>
				</div>
			) : (
				<DocumentListContent
					tab={tab}
					sort={sort}
					selectedScopePill={selectedScopePill}
					onScopePillChange={setSelectedScopePill}
					onSortChange={handleSortChange}
					curatedItems={curatedItems}
					triageItems={triageItems}
					apiLoading={apiLoading}
					apiError={apiError}
					isCuratedEmpty={isCuratedEmpty}
					isTriageEmpty={isTriageEmpty}
					onNavigate={(id) => navigate(`/documents/${id}`)}
					searchQuery={searchQuery}
					onTriageAction={handleTriageAction}
					onRetry={handleRetry}
					onTabChange={handleTabChange}
					onSearchChange={setSearchQuery}
					onNewItem={() => navigate("/documents/new")}
					onNewChild={(parentId) => navigate(`/documents/new?parentId=${parentId}`)}
					showMemories={showMemories}
					onToggleMemories={() => setShowMemories((prev) => !prev)}
				/>
			)}
		</PageScaffold>
	);
}
