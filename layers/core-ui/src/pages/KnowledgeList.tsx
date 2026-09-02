/**
 * Knowledge/List page — a Curated list and a draft-item Triage view.
 *
 * @lore J6: Tab memory (Triage/Curated) stays in component state only —
 * AC explicitly forbids localStorage persistence here.
 *
 * @lore L22: Triage view fetches from /api/knowledge (the general list
 * endpoint). Sort controls use URL state (?sort=recency). Default = recency.
 * @lore AU44 batch 4: signals removed (FULL-AUDIT.md row 13). frequency/relevance pills
 * removed. attentionScore triage sort removed. Plain recency list throughout.
 *
 * @lore N5: Replaced all fixture imports with real API calls. Both Triage and
 * Curated tabs now read from /api/knowledge.
 * Curation suggestions have no API yet so that block is suppressed.
 * Tab-default logic uses API status ("draft" = needs review, was "needs_human").
 *
 * @lore Q2: "+ New" button previously opened KnowledgeCreateDialog. Now navigates
 * to /knowledge/new (full-page create route). User-scoped items show a "Private"
 * tag in the list. scopeKind/scopeId fields added to ApiKnowledgeItem.
 *
 * @lore visual-parity: Page structure changed to flex flex-col h-full with
 * fixed header (non-scrolling) and flex-1 overflow-y-auto body, per AppShell
 * overflow-hidden contract. Visual treatment updated to match knowledge-list.html:
 * segmented pill tab control, outlined scope pills, plain-text sort bar,
 * inline KnowledgeListRow replacing KnowledgeRow primitive.
 *
 * @lore nested-knowledge-items: topic grouping (KnowledgeTopicGroup, "curated
 * = topic buckets") is REMOVED — `topic` no longer exists on the kernel row.
 * The Curated tab is now a flat sorted list, same rendering shape as Triage.
 * Browsing the actual tree (parent/child nesting) lives on the detail page's
 * children list, not here. The old scope URL param (`?scope=practice|product`)
 * used dead scope values and drove nothing but a hidden sr-only indicator —
 * removed along with the values it read.
 */

import type { KnowledgeSortOption, KnowledgeStatus } from "@hyperidle/domain-model";
import { KNOWLEDGE_STATUS_LABEL } from "@hyperidle/domain-model";
import {
	Button,
	EmptyState,
	ErrorState,
	ItemList,
	knowledgeStatusToStatus,
	PageHeader,
	PageScaffold,
	Row,
	ScopePicker,
	SkeletonList,
	StatusChip,
} from "../ds";

// @lore AU44 batch 4: signals (accessCount30d, relevanceScore, etc.) removed per FULL-AUDIT.md row 13.
// Only the recency pill survives. KNOWLEDGE_SORT_OPTIONS (includes frequency/relevance) is no longer
// iterated for rendering — use this local constant so the UI never shows dead sort options.
const VISIBLE_SORT_OPTIONS = ["recency"] as const;

import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useFetch } from "../hooks/useFetch";
import type { AppShellOutletContext } from "../layouts/AppShell.js";
import { apiFetch } from "../services/api-fetch.js";
import { clipExcerpt } from "../utils/clip-excerpt.js";
import { SCOPE_PILL_OPTIONS, type ScopePillOption } from "../utils/scope-labels";
import { stripMarkdown } from "../utils/strip-markdown.js";
import { relativeShort } from "../utils/time.js";

type KnowledgeTab = "triage" | "curated";

/**
 * AF13 §3: Pure sort helper for knowledge items.
 * Returns a new array — does NOT mutate the input.
 *
 * recency:   updatedAt desc, tie-break title asc
 * recency: updatedAt desc, tie-break title asc
 *
 * @lore AF13: Previously sort pills only changed the URL param but the item list
 * was never reordered. This function is applied both within topic groups (curated)
 * and to the flat triage list so sort pills actually do something.
 * @lore AU44 batch 4: frequency and relevance branches removed (FULL-AUDIT.md row 13 —
 * signals die). Only recency survives. Non-recency values fall through to recency behavior.
 */
export function sortItems(items: ApiKnowledgeItem[]): ApiKnowledgeItem[] {
	return [...items].sort((a, b) => {
		// recency (and any future unrecognised value): updatedAt desc, tie-break title asc
		const cmp = b.updatedAt.localeCompare(a.updatedAt);
		if (cmp !== 0) return cmp;
		return a.title.localeCompare(b.title);
	});
}

function isKnowledgeSortOption(value: string | null): value is KnowledgeSortOption {
	return (VISIBLE_SORT_OPTIONS as readonly string[]).includes(value ?? "");
}

function deriveSort(searchParams: URLSearchParams): KnowledgeSortOption {
	const raw = searchParams.get("sort");
	return isKnowledgeSortOption(raw) ? raw : "recency";
}

/**
 * Shape of an item returned by GET /api/knowledge.
 * @lore AU44 batch 4: signals wrapper removed (FULL-AUDIT.md row 13). attentionScore is now
 * a flat field written by the PLUGIN attention service and returned top-level by the list route.
 */
interface ApiKnowledgeItem {
	id: string;
	title: string;
	body: string;
	format: string;
	status: string;
	version: number;
	updatedBy: string;
	scopeKind?: string;
	scopeId?: string | null;
	createdAt: string;
	updatedAt: string;
	attentionScore?: number | null;
	/**
	 * @lore nested-knowledge-items §4: already in the payload (a kernel
	 * column), just previously undeclared here. `null` or `"knowledge_item"`
	 * means the row is ordinary, browsable knowledge; anything else (agent,
	 * task, thread, routine) is a role-carrying binding that belongs to its
	 * own surface, not this list — the parent rule that replaces the old
	 * `role !== "skill" && role !== "rule"` filter.
	 */
	parentKind?: string | null;
}

interface ApiKnowledgeListResponse {
	items: ApiKnowledgeItem[];
}

function toKnowledgeStatus(apiStatus: string): KnowledgeStatus {
	switch (apiStatus) {
		case "active":
			return "active";
		case "archived":
			return "archived";
		case "stale":
			return "stale";
		default:
			return "proposed";
	}
}

// AG6: KnowledgeListRow deleted. Rows now rendered via Row + ItemList variant="flush".

interface KnowledgeListContentProps {
	tab: KnowledgeTab;
	sort: KnowledgeSortOption;
	/** AD6: The currently selected static scope pill option. null = "All". */
	selectedScopePill: ScopePillOption | null;
	onScopePillChange: (pill: ScopePillOption | null) => void;
	onSortChange: (option: KnowledgeSortOption) => void;
	curatedItems: ApiKnowledgeItem[];
	triageItems: ApiKnowledgeItem[];
	apiLoading: boolean;
	apiError: string | null;
	isCuratedEmpty: boolean;
	isTriageEmpty: boolean;
	onNavigate: (id: string) => void;
	searchQuery: string;
	/** Y4: called when the user validates (active) or rejects (archived) a triage item. */
	onTriageAction: (itemId: string, newStatus: "active" | "archived") => void;
	/** UI-010/UI-015: re-issues the /api/knowledge request from the error state. */
	onRetry?: () => void;
	/** FR-19: tab change callback — moves tab control from PageHeader into the body lane. */
	onTabChange: (tab: KnowledgeTab) => void;
	/** FR-19: search query change callback. */
	onSearchChange: (query: string) => void;
	/** FR-19: navigate to new knowledge item creation. */
	onNewItem: () => void;
}

function KnowledgeListContent({
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
}: KnowledgeListContentProps): JSX.Element {
	// Y4: keyboard navigation state for triage items (-1 = no focus)
	const [focusedIndex, setFocusedIndex] = useState<number>(-1);

	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredTriageItems = normalizedQuery
		? triageItems.filter((i) => i.title.toLowerCase().includes(normalizedQuery))
		: triageItems;
	const filteredCuratedItems = normalizedQuery
		? curatedItems.filter((i) => i.title.toLowerCase().includes(normalizedQuery))
		: curatedItems;

	// Y4: keyboard navigation handler for triage tab
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

	// Y4: reset focused index when triage items change (e.g. after optimistic removal)
	useEffect(() => {
		setFocusedIndex((prev) => {
			if (filteredTriageItems.length === 0) return -1;
			if (prev >= filteredTriageItems.length) return filteredTriageItems.length - 1;
			return prev;
		});
	}, [filteredTriageItems.length]);

	return (
		<div className="max-w-[800px] w-full">
			{/* FR-19: Tab controls + search + New — moved from PageHeader.actions to body at 800px lane */}
			<div className="flex items-center justify-between py-[12px]">
				<div
					role="tablist"
					aria-label="Knowledge view"
					className="inline-flex gap-[6px] bg-[var(--surface-container)] rounded-[var(--r-pill)] p-[3px]"
					data-testid="knowledge-tabs"
				>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "curated"}
						className={`type-control ${
							tab === "curated"
								? "px-[12px] py-[6px] rounded-[var(--r-pill)]   bg-[var(--surface-elevated)] text-[var(--accent-deep)] shadow-[var(--shadow-subtle)] cursor-pointer border-none"
								: "px-[12px] py-[6px] rounded-[var(--r-pill)]   text-[var(--text-secondary)] cursor-pointer border-none bg-transparent"
						}`}
						onClick={() => onTabChange("curated")}
					>
						Curated
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={tab === "triage"}
						className={`type-control ${
							tab === "triage"
								? "px-[12px] py-[6px] rounded-[var(--r-pill)]   bg-[var(--surface-elevated)] text-[var(--accent-deep)] shadow-[var(--shadow-subtle)] cursor-pointer border-none"
								: "px-[12px] py-[6px] rounded-[var(--r-pill)]   text-[var(--text-secondary)] cursor-pointer border-none bg-transparent"
						}`}
						onClick={() => onTabChange("triage")}
					>
						Triage
					</button>
				</div>
				<div className="flex items-center gap-[9px]">
					<input
						type="search"
						aria-label="Filter knowledge"
						data-testid="knowledge-search"
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
			{/*
			 * AD6: Static 4-pill scope filter row.
			 * All → no filter | Shared → factory+product+practice | Team → team | Private → user.
			 * AI5: consolidated to the shared ScopePicker primitive (filter mode).
			 * The "All" pill (filterKinds=null) maps to value=null; selecting any
			 * other pill resolves the id back to its SCOPE_PILL_OPTIONS entry.
			 */}
			<div className="pt-[12px]">
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
					dataTestId="knowledge-scope-pills"
				/>
			</div>

			{/* AF13 §3: Sort pills changed from role=radio to plain buttons so
			    getByRole("button", { name: /recency/ }) works in tests.
			    @lore AF13: role="radio" buttons are not found by getByRole("button"),
			    since explicit role overrides the implicit element role. */}
			<div
				role="group"
				aria-label="Sort order"
				data-testid="knowledge-sort-bar"
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
							// @lore AF13: aria-checked kept alongside aria-pressed so U9 test
							// [aria-checked='true'] query still passes. role="radio" was removed
							// because it prevents getByRole("button") from finding these pills.
							aria-checked={isActive}
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
				// @lore UI-125: block (not flex) so sticky bottom-0 on the hint bar resolves
				// to the scroll container (overflow-y-auto), not to this flex container.
				// position:sticky's containing block for flex items is the flex parent,
				// which has no overflow — so sticky never fired. Block flow lets it find
				// the real scroll ancestor.
				<div data-testid="knowledge-triage-view">
					{apiLoading ? (
						<div className="py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading triage items" />
						</div>
					) : apiError ? (
						<div className="py-[12px]">
							<ErrorState
								title="Couldn't load knowledge"
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
								dataTestId="knowledge-triage-empty"
							/>
						</div>
					) : (
						<ItemList variant="flush" as="ul" isEmpty={filteredTriageItems.length === 0}>
							{filteredTriageItems.map((item, index) => {
								const isPrivate = item.scopeKind === "user";
								const itemStatus = toKnowledgeStatus(item.status);
								return (
									<Row
										key={item.id}
										as="li"
										data-testid="knowledge-row"
										data-focused={focusedIndex === index ? "true" : undefined}
										title={item.title}
										subtitle={
											item.body ? clipExcerpt(stripMarkdown(item.body)) || undefined : undefined
										}
										cells={[
											...(isPrivate
												? [
														{
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
															"data-testid": "private-badge" as const,
														},
													]
												: []),
											...(itemStatus === "active" || itemStatus === "archived"
												? [
														{
															content: (
																<span data-testid="status-badge">
																	<StatusChip
																		status={knowledgeStatusToStatus(itemStatus)}
																		label={KNOWLEDGE_STATUS_LABEL[itemStatus]}
																	/>
																</span>
															),
														},
													]
												: []),
											{
												content: relativeShort(item.updatedAt),
												"data-testid": "knowledge-time" as const,
											},
										]}
										actions={
											<div className="flex items-center gap-[3px]">
												<button
													type="button"
													aria-label="Validate"
													title="Validate"
													onClick={(e) => {
														e.stopPropagation();
														onTriageAction(item.id, "active");
													}}
													className="w-[24px] h-[24px] flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] border-none bg-transparent cursor-pointer"
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
												</button>
												<button
													type="button"
													aria-label="Reject"
													title="Reject"
													onClick={(e) => {
														e.stopPropagation();
														onTriageAction(item.id, "archived");
													}}
													className="w-[24px] h-[24px] flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] border-none bg-transparent cursor-pointer"
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
												</button>
												<button
													type="button"
													aria-label="Open"
													title="Open"
													onClick={(e) => {
														e.stopPropagation();
														onNavigate(item.id);
													}}
													className="w-[24px] h-[24px] flex items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] border-none bg-transparent cursor-pointer"
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
												</button>
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
				<div className="flex flex-col" data-testid="knowledge-curated-view">
					{apiLoading ? (
						<div className="py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading curated items" />
						</div>
					) : apiError ? (
						/* UI-010: a 500/network failure must show an error state with retry,
						 * not the "No knowledge items yet" empty state (which implies success). */
						<div className="py-[12px]">
							<ErrorState
								title="Couldn't load knowledge"
								description={apiError}
								onRetry={onRetry}
							/>
						</div>
					) : isCuratedEmpty ? (
						<div className="flex items-center justify-center p-[48px_24px]">
							<EmptyState
								title="No knowledge items yet"
								description="Agents will populate this scope as they learn. Check back after the next review cycle."
								dataTestId="knowledge-curated-empty"
							/>
						</div>
					) : (
						<ItemList variant="flush" as="ul" isEmpty={filteredCuratedItems.length === 0}>
							{filteredCuratedItems.map((item) => {
								const isPrivate = item.scopeKind === "user";
								return (
									<Row
										key={item.id}
										as="li"
										data-testid="knowledge-row"
										title={item.title}
										subtitle={
											item.body ? clipExcerpt(stripMarkdown(item.body)) || undefined : undefined
										}
										cells={[
											...(isPrivate
												? [
														{
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
															"data-testid": "private-badge" as const,
														},
													]
												: []),
											{
												content: relativeShort(item.updatedAt),
												"data-testid": "knowledge-time" as const,
											},
										]}
										onClick={() => onNavigate(item.id)}
									/>
								);
							})}
						</ItemList>
					)}
				</div>
			)}
		</div>
	);
}

export interface KnowledgeListProps {
	loading?: boolean;
	error?: { message: string; onRetry?: () => void } | null;
}

export function KnowledgeList({
	loading = false,
	error = null,
}: KnowledgeListProps = {}): JSX.Element {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const sort = deriveSort(searchParams);
	const { user, retry: retryUser } = useCurrentUser();
	// @lore NEW-24: optional — gracefully absent in story/test contexts without an AppShell outlet.
	const outletCtx = useOutletContext<AppShellOutletContext | null>();

	const [tab, setTab] = useState<KnowledgeTab>("triage");
	const tabManuallySelectedRef = useRef(false);
	/**
	 * AD6: selectedScopePill — null means "All" (no filter).
	 * Replaces the old dynamic string-keyed selectedScopeFilter.
	 */
	const [selectedScopePill, setSelectedScopePill] = useState<ScopePillOption | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	// AF13 §6: Replace optimisticRemovals (Set<id>) with optimisticStatuses (Map<id, status>).
	// A validated item gets status "active" so it moves to Curated in the same render.
	// A rejected item gets status "archived" so it leaves Triage and does not appear in Curated.
	// On PATCH failure, the map entry is deleted to revert the item to its original status.
	// @lore AF13: The old Set only removed items from Triage but never added them to Curated.
	// The Map approach applies status overrides before the triage/curated split so one render
	// handles both the departure from Triage and the arrival in Curated.
	const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, "active" | "archived">>(
		new Map(),
	);

	const {
		data: apiData,
		isLoading: apiLoading,
		error: apiError,
		refetch: apiRefetch,
	} = useFetch<ApiKnowledgeListResponse>("/api/knowledge");

	// @lore NEW-24: combined retry re-issues the knowledge fetch + all AppShell-owned fetches
	// (user and sidebar knowledge list). Without retrying the user fetch, the N5 short-circuit
	// (no participantId → no thread fetch) stays active after an outage+restart, so the sidebar
	// stays in error even when the main-pane content loads.
	const handleRetry = useCallback((): void => {
		apiRefetch();
		retryUser();
		outletCtx?.onRetryShell?.();
	}, [apiRefetch, retryUser, outletCtx]);

	// @lore nested-knowledge-items §4: the old `role !== "skill" && role !==
	// "rule"` filter is REPLACED, not deleted — a role-carrying binding
	// (agent identity, routine prompt, skill, rule) is any row whose parent
	// is set but is not `knowledge_item`. GET /api/knowledge already excludes
	// these server-side (knowledge-repository.ts's `visibleWithSignals`), but
	// the client keeps its own check too: it is the one place this page's
	// contract with its data source is expressed in code, not just in the
	// server it happens to be pointed at today.
	const allItems = useMemo<ApiKnowledgeItem[]>(
		() =>
			(apiData?.items ?? []).filter(
				(item) => item.parentKind === null || item.parentKind === undefined || item.parentKind === "knowledge_item",
			),
		[apiData],
	);

	/**
	 * AD6: Apply static scope filter before triage/curated split.
	 * null pill → all items | specific pill → only items whose scopeKind is in filterKinds.
	 * AF13: Also applies optimisticStatuses overrides so triage/curated split reflects
	 * the immediate user action without waiting for refetch.
	 */
	const scopeFilteredItems = useMemo<ApiKnowledgeItem[]>(() => {
		// Apply optimistic status overrides before scope filter
		const withOverrides =
			optimisticStatuses.size > 0
				? allItems.map((i) => {
						const override = optimisticStatuses.get(i.id);
						return override !== undefined ? { ...i, status: override } : i;
					})
				: allItems;
		if (selectedScopePill === null || selectedScopePill.filterKinds === null) return withOverrides;
		const allowed = new Set<string>(selectedScopePill.filterKinds);
		return withOverrides.filter((i) => i.scopeKind !== undefined && allowed.has(i.scopeKind));
	}, [allItems, selectedScopePill, optimisticStatuses]);

	// @lore nested-knowledge-items: triage/curated now split on the collapsed
	// 4-value ladder — "proposed" replaces the old draft/needs_human pair,
	// "active" is unchanged.
	// @lore AU44 batch 4: attentionScore sort removed (FULL-AUDIT.md row 13 — attention sort dies
	// with signals). Triage is now a plain recency list; the sort pill applies if selected.
	const triageItems = useMemo<ApiKnowledgeItem[]>(() => {
		const raw = scopeFilteredItems.filter((i) => i.status === "proposed");
		return sortItems(raw);
	}, [scopeFilteredItems]);

	const curatedItems = useMemo<ApiKnowledgeItem[]>(() => {
		const raw = scopeFilteredItems.filter((i) => i.status === "active");
		return sortItems(raw);
	}, [scopeFilteredItems]);

	useEffect(() => {
		if (tabManuallySelectedRef.current) return;
		const hasTriage = allItems.some((i) => i.status === "proposed");
		setTab(hasTriage ? "triage" : "curated");
	}, [allItems]);

	// AF13 §6: Optimistic status-override + PATCH for triage actions.
	// Uses Map<id, status> instead of Set<id> so validated items appear in Curated
	// immediately (override status → "active") rather than vanishing from all tabs.
	// @lore Y4-F01: must use apiFetch (not raw fetch) so X-API-Key is injected.
	// @lore Y4-F02: item.version prevents 409 on items at version 2+; user.id
	//   replaces the hardcoded "founder" so the audit trail is correct.
	// @lore AF13: On PATCH failure, the override entry is deleted to restore the
	//   original status so the item reappears in Triage for retry.
	function handleTriageAction(itemId: string, newStatus: "active" | "archived"): void {
		const item = allItems.find((i) => i.id === itemId);
		const version = item?.version ?? 1;
		const updatedBy = user?.id ?? "unknown";

		// Optimistically override status (validated → active, rejected → archived)
		setOptimisticStatuses((prev) => new Map([...prev, [itemId, newStatus]]));

		void (async (): Promise<void> => {
			try {
				const res = await apiFetch(`/api/knowledge/${itemId}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ version, updatedBy, status: newStatus }),
				});
				if (!res.ok) {
					// Revert optimistic override so the item reappears in Triage for retry
					setOptimisticStatuses((prev) => {
						const next = new Map(prev);
						next.delete(itemId);
						return next;
					});
				}
			} catch {
				// Network error — revert so the user can retry
				setOptimisticStatuses((prev) => {
					const next = new Map(prev);
					next.delete(itemId);
					return next;
				});
			}
		})();
	}

	function handleSortChange(newSort: KnowledgeSortOption): void {
		const next = new URLSearchParams(searchParams);
		next.set("sort", newSort);
		setSearchParams(next, { replace: true });
	}

	function handleTabChange(newTab: KnowledgeTab): void {
		tabManuallySelectedRef.current = true;
		setTab(newTab);
	}

	if (loading) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Knowledge" />}
				data-testid="knowledge-list-page"
			>
				<SkeletonList rows={6} ariaLabel="Loading knowledge" />
			</PageScaffold>
		);
	}

	if (error) {
		return (
			<PageScaffold
				frame="page"
				header={<PageHeader title="Knowledge" />}
				data-testid="knowledge-list-page"
			>
				<ErrorState
					title="Couldn't load knowledge"
					description={error.message}
					onRetry={error.onRetry}
				/>
			</PageScaffold>
		);
	}

	// UI-010: only show "system empty" when there is no API error — a 500/429 must
	// surface as an error state (ErrorState + retry), NOT as "your knowledge base is empty".
	const systemEmpty = allItems.length === 0 && !apiLoading && !apiError;
	const isCuratedEmpty = curatedItems.length === 0 && !apiLoading;
	const isTriageEmpty = triageItems.length === 0 && !apiLoading;

	return (
		<PageScaffold
			frame="page"
			data-testid="knowledge-list-page"
			header={
				/* AI7: PageHeader — Knowledge title + tabs + search + New button in actions.
				    When systemEmpty: title only. When populated: tabs + search + New in actions. */
				<PageHeader
					title={
						<>
							<span className="sr-only">Knowledge Base</span>
							Knowledge
						</>
					}
				/>
			}
		>
			{systemEmpty ? (
				<div className="flex items-center justify-center p-[48px_24px] h-full">
					<EmptyState
						title="Your knowledge base is empty"
						description="Knowledge items capture patterns, decisions, and lessons learned. As your agents work, they will start indexing insights here automatically. You can also add items manually."
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
							/* AI5: shared Button primitive. */
							<Button variant="primary" onClick={() => navigate("/knowledge/new")}>
								Create first item
							</Button>
						}
						dataTestId="knowledge-curated-empty"
					/>
				</div>
			) : (
				<KnowledgeListContent
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
					onNavigate={(id) => navigate(`/knowledge/${id}`)}
					searchQuery={searchQuery}
					onTriageAction={handleTriageAction}
					onRetry={handleRetry}
					onTabChange={handleTabChange}
					onSearchChange={setSearchQuery}
					onNewItem={() => navigate("/knowledge/new")}
				/>
			)}
		</PageScaffold>
	);
}
