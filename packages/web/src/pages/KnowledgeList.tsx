import { EmptyState, ErrorState, KnowledgeRow, SkeletonList } from "@hyperidle/design-system";
/**
 * Knowledge/List page — list with topic grouping (Curated) and
 * draft-item Triage view.
 *
 * @lore J6: the page reads scope from the URL search param `scope` so the
 * AppShell's Sidebar scope selector can drive it without lifting state out
 * of the page. Tab memory (Triage/Curated) stays in component state only —
 * AC explicitly forbids localStorage persistence here.
 *
 * @lore L22: Triage view fetches from /api/knowledge (the general list
 * endpoint). Sort controls use URL state (?sort=recency|frequency).
 * Default (no param) = relevance sort.
 *
 * @lore N5: Replaced all fixture imports with real API calls. Both Triage and
 * Curated tabs now read from /api/knowledge. The real schema has no layer/kind
 * columns — those were mock-only fields removed in O2. layer and kind are
 * rendered with fallback values ("L0" / "brief") when absent from the API.
 * Curation suggestions have no API yet so that block is suppressed.
 * Tab-default logic uses API status ("draft" = needs review, was "needs_human").
 * Scope param is preserved in the URL for future API filter support but does
 * not filter the item list today — the O2 schema has no scope column.
 *
 * @lore Q2: "+ New" button opens KnowledgeCreateDialog. User-scoped items show
 * a "Private" tag in the list. scopeKind/scopeId fields added to ApiKnowledgeItem.
 */
import type {
	KnowledgeKind,
	KnowledgeLayer,
	KnowledgeScope,
	KnowledgeSortOption,
	KnowledgeStatus,
	KnowledgeTopicHealth,
} from "@hyperidle/fabric/types";
import { KNOWLEDGE_SORT_OPTIONS } from "@hyperidle/fabric/types";
import { type JSX, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KnowledgeTopicGroup } from "../components/KnowledgeTopicGroup";
import { useFetch } from "../hooks/useFetch";
import { useHint } from "../hooks/useHints";
import { relativeTime } from "../utils/relative-time";
import { KnowledgeCreateDialog } from "./knowledge/KnowledgeCreateDialog";

type KnowledgeTab = "triage" | "curated";

function isKnowledgeScope(value: string | null): value is KnowledgeScope {
	return value === "practice" || value === "product" || value === "factory";
}

function deriveScope(searchParams: URLSearchParams): KnowledgeScope {
	const raw = searchParams.get("scope");
	return isKnowledgeScope(raw) ? raw : "practice";
}

function isKnowledgeSortOption(value: string | null): value is KnowledgeSortOption {
	return (KNOWLEDGE_SORT_OPTIONS as readonly string[]).includes(value ?? "");
}

function deriveSort(searchParams: URLSearchParams): KnowledgeSortOption {
	const raw = searchParams.get("sort");
	return isKnowledgeSortOption(raw) ? raw : "relevance";
}

/** Shape of an item returned by GET /api/knowledge */
interface ApiKnowledgeItem {
	id: string;
	topic: string | null;
	title: string;
	body: string;
	format: string;
	status: string;
	version: number;
	updatedBy: string;
	/** Q2: scope_kind column added. Defaults to "factory" for pre-Q2 items. */
	scopeKind?: string;
	/** Q2: scope_id column — null for factory/user scopes. */
	scopeId?: string | null;
	createdAt: string;
	updatedAt: string;
	signals?: {
		lastActivityAt?: string | null;
		accessCount30d?: number | null;
		citationCount?: number | null;
		relevanceScore?: number | null;
	} | null;
}

interface ApiKnowledgeListResponse {
	items: ApiKnowledgeItem[];
}

/**
 * Map an API status string to a valid KnowledgeStatus for the design system.
 * O2 simplified statuses are "draft" | "active" | "archived"; the design
 * system KnowledgeStatus type uses the extended pre-O2 set.
 * @lore N5: "draft" maps to "captured" (paused chip) because the design
 * system KNOWLEDGE_STATUS_MAP doesn't contain "draft". This is a UI-display
 * mapping only — the underlying status string from the API is unchanged.
 */
function toKnowledgeStatus(apiStatus: string): KnowledgeStatus {
	switch (apiStatus) {
		case "active":
			return "active";
		case "archived":
			return "archived";
		case "draft":
		default:
			return "captured";
	}
}

/** Sort a list of API items by the given sort option. */
function sortApiItems(items: ApiKnowledgeItem[], sort: KnowledgeSortOption): ApiKnowledgeItem[] {
	const copy = [...items];
	switch (sort) {
		case "recency":
			return copy.sort((a, b) => {
				const aAt = a.signals?.lastActivityAt ?? null;
				const bAt = b.signals?.lastActivityAt ?? null;
				if (aAt === null && bAt === null) return a.id.localeCompare(b.id);
				if (aAt === null) return 1;
				if (bAt === null) return -1;
				const primary = bAt.localeCompare(aAt); // most recent first
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
		case "frequency":
			return copy.sort((a, b) => {
				const aCount = a.signals?.accessCount30d ?? null;
				const bCount = b.signals?.accessCount30d ?? null;
				if (aCount === null && bCount === null) return a.id.localeCompare(b.id);
				if (aCount === null) return 1;
				if (bCount === null) return -1;
				const primary = bCount - aCount; // highest frequency first
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
		case "relevance":
		default:
			return copy.sort((a, b) => {
				const aScore = a.signals?.relevanceScore ?? null;
				const bScore = b.signals?.relevanceScore ?? null;
				if (aScore === null && bScore === null) return a.id.localeCompare(b.id);
				if (aScore === null) return 1;
				if (bScore === null) return -1;
				const primary = bScore - aScore; // highest relevance first
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
	}
}

/**
 * Derive topic health from the share of archived items in the group.
 * In the O2 schema "stale" no longer exists; archived items serve as
 * the stale-equivalent for health colouring.
 */
function deriveTopicHealth(totalCount: number, archivedCount: number): KnowledgeTopicHealth {
	if (totalCount === 0 || archivedCount === 0) return "fresh";
	const ratio = archivedCount / totalCount;
	if (ratio >= 0.5) return "mostly_stale";
	return "some_stale";
}

/**
 * Group a list of API items by topic. Items with no topic go to "General".
 * Returns a stable-ordered list (insertion order of first topic occurrence).
 */
function groupByTopic(items: ApiKnowledgeItem[]): Array<{
	topic: string;
	items: ApiKnowledgeItem[];
	staleCount: number;
	health: KnowledgeTopicHealth;
}> {
	const byTopic = new Map<string, ApiKnowledgeItem[]>();
	for (const item of items) {
		const key = item.topic ?? "General";
		const bucket = byTopic.get(key);
		if (bucket) {
			bucket.push(item);
		} else {
			byTopic.set(key, [item]);
		}
	}
	return Array.from(byTopic.entries()).map(([topic, topicItems]) => {
		const archivedCount = topicItems.filter((i) => i.status === "archived").length;
		return {
			topic,
			items: topicItems,
			staleCount: archivedCount,
			health: deriveTopicHealth(topicItems.length, archivedCount),
		};
	});
}

export interface KnowledgeListProps {
	/**
	 * J8: opt-in loading state so callers (and stories) can render the
	 * skeleton list variant. Defaults to false so production render path
	 * is unchanged.
	 */
	loading?: boolean;
	/** J8: opt-in error state. When present, ErrorState takes over. */
	error?: { message: string; onRetry?: () => void } | null;
}

export function KnowledgeList({
	loading = false,
	error = null,
}: KnowledgeListProps = {}): JSX.Element {
	const navigate = useNavigate();
	const hintKnowledgeEmpty = useHint("knowledge-empty");
	const [searchParams, setSearchParams] = useSearchParams();
	const scope = deriveScope(searchParams);
	const sort = deriveSort(searchParams);

	// @lore J6 AC: tab choice remembered in component state only — NOT
	// localStorage. Default recomputed below whenever API data changes.
	const [tab, setTab] = useState<KnowledgeTab>("triage");

	// Q2: create dialog state and refresh counter (useFetch re-fetches when URL changes)
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [fetchRevision, setFetchRevision] = useState(0);

	// N5: fetch all items from the real API unconditionally (both tabs need the data)
	// Q2: fetchRevision appended as a cache-buster query param so POST→refresh works.
	// @lore Q2: useFetch has no refresh method. Appending ?_r=N to the URL causes
	// useEffect to re-run with the new URL, triggering a fresh fetch. The server
	// ignores unknown query params.
	const {
		data: apiData,
		isLoading: apiLoading,
		error: apiError,
	} = useFetch<ApiKnowledgeListResponse>(
		fetchRevision === 0 ? "/api/knowledge" : `/api/knowledge?_r=${fetchRevision}`,
	);

	function handleCreated(): void {
		setFetchRevision((prev) => prev + 1);
	}

	const allItems = useMemo<ApiKnowledgeItem[]>(() => apiData?.items ?? [], [apiData]);

	// Triage = draft items (needs human review in O2 schema)
	const triageItems = useMemo<ApiKnowledgeItem[]>(
		() =>
			sortApiItems(
				allItems.filter((i) => i.status === "draft"),
				sort,
			),
		[allItems, sort],
	);

	// Curated = active items grouped by topic
	const curatedItems = useMemo<ApiKnowledgeItem[]>(
		() => allItems.filter((i) => i.status === "active"),
		[allItems],
	);

	const grouped = useMemo(() => groupByTopic(curatedItems), [curatedItems]);

	// AC: "Default to Triage when any items have status === 'draft', else Curated."
	// Also AC: "Switching scope resets list selection and filters."
	useEffect(() => {
		void scope;
		const hasDraft = allItems.some((i) => i.status === "draft");
		setTab(hasDraft ? "triage" : "curated");
	}, [allItems, scope]);

	/** Update sort URL state. Removes param when defaulting to relevance. */
	function handleSortChange(newSort: KnowledgeSortOption): void {
		const next = new URLSearchParams(searchParams);
		if (newSort === "relevance") {
			next.delete("sort");
		} else {
			next.set("sort", newSort);
		}
		setSearchParams(next, { replace: true });
	}

	if (loading) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
				<SkeletonList rows={6} ariaLabel="Loading knowledge" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
				<ErrorState
					title="Couldn't load knowledge"
					description={error.message}
					onRetry={error.onRetry}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="knowledge-list-page">
			<div className="flex items-center justify-between">
				<h1 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
					Knowledge Base
				</h1>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="btn btn-xs btn-primary"
						onClick={() => setCreateDialogOpen(true)}
					>
						+ New
					</button>
				</div>
			</div>

			{/* Q2: KnowledgeCreateDialog — factory scope (no lock) for the global list */}
			<KnowledgeCreateDialog
				open={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onCreated={handleCreated}
			/>

			{/*
			 * @lore U9 AC-6: Scope pill filter bar above Triage/Curated tabs.
			 * "All" shows everything. Practices/Products/Factory match the sidebar
			 * KNOWLEDGE_SCOPE_ITEMS. Active pill uses btn-primary.
			 */}
			<div
				className="flex items-center gap-1 flex-wrap"
				data-testid="knowledge-scope-pills"
				role="group"
				aria-label="Filter by scope"
			>
				{(
					[
						{ id: "all", label: "All", scopeValue: null },
						{ id: "practices", label: "Practices", scopeValue: "practice" },
						// @lore U11: "Products" is a legitimate knowledge scope label.
						// The three scopes (Practices, Products, Factory) are org-level
						// knowledge domains per docs/knowledge-architecture/. "Products"
						// covers product-level knowledge (decisions, specs, strategy)
						// and is distinct from the "Teams" primitive in the Work surface.
						{ id: "products", label: "Products", scopeValue: "product" },
						{ id: "factory", label: "Factory", scopeValue: "factory" },
					] as const
				).map((pill) => {
					// "All" is active when no scope param is set
					// Others match the URL scope param value
					const rawScope = searchParams.get("scope");
					const isActive = pill.id === "all" ? !rawScope : rawScope === pill.scopeValue;
					return (
						<button
							key={pill.id}
							type="button"
							data-testid={`scope-pill-${pill.id}`}
							className={`btn btn-xs ${isActive ? "btn-primary" : "btn-ghost"}`}
							onClick={() => {
								const next = new URLSearchParams(searchParams);
								if (pill.id === "all" || pill.scopeValue === null) {
									next.delete("scope");
								} else {
									next.set("scope", pill.scopeValue);
								}
								setSearchParams(next, { replace: true });
							}}
						>
							{pill.label}
						</button>
					);
				})}
			</div>

			{/*
			 * @lore U9/J6: hidden machine-readable scope indicator preserved for
			 * J6 test backward-compat. Visual scope is shown by the active pill above.
			 */}
			<span data-testid="knowledge-scope-indicator" className="sr-only">
				{scope}
			</span>

			<div
				role="tablist"
				aria-label="Knowledge view"
				className="flex gap-1"
				data-testid="knowledge-tabs"
			>
				<button
					type="button"
					role="tab"
					aria-selected={tab === "triage"}
					className={tab === "triage" ? "btn btn-xs btn-primary" : "btn btn-xs btn-ghost"}
					onClick={() => setTab("triage")}
				>
					Triage
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === "curated"}
					className={tab === "curated" ? "btn btn-xs btn-primary" : "btn btn-xs btn-ghost"}
					onClick={() => setTab("curated")}
				>
					Curated
				</button>
			</div>

			{tab === "triage" ? (
				<div className="flex flex-col gap-2" data-testid="knowledge-triage-view">
					{/* L22 sort controls — radiogroup semantics per accessibility spec */}
					<div
						role="radiogroup"
						aria-label="Sort order"
						data-testid="knowledge-sort-controls"
						className="flex items-center gap-1"
					>
						{KNOWLEDGE_SORT_OPTIONS.map((option) => {
							const isActive = sort === option;
							return (
								<button
									key={option}
									type="button"
									role="radio"
									aria-checked={isActive}
									onClick={() => handleSortChange(option)}
									className={
										isActive
											? "btn btn-xs btn-primary capitalize"
											: "btn btn-xs btn-ghost capitalize"
									}
								>
									{option}
								</button>
							);
						})}
					</div>

					{apiLoading ? (
						<SkeletonList rows={4} ariaLabel="Loading triage items" />
					) : apiError ? (
						<ErrorState title="Couldn't load knowledge" description={apiError} />
					) : triageItems.length > 0 ? (
						<div className="flex flex-col">
							{triageItems.map((item) => {
								const signals = item.signals
									? {
											recency: item.signals.lastActivityAt
												? relativeTime(item.signals.lastActivityAt)
												: null,
											frequency: item.signals.accessCount30d ?? null,
											citation: item.signals.citationCount ?? null,
										}
									: undefined;
								const isPrivate = item.scopeKind === "user";
								return (
									<div key={item.id}>
										<KnowledgeRow
											title={item.title}
											layer={"L0" as KnowledgeLayer}
											kind={"brief" as KnowledgeKind}
											status={toKnowledgeStatus(item.status)}
											timestamp={relativeTime(item.updatedAt)}
											signals={signals}
											onClick={() => navigate(`/knowledge/${item.id}`)}
										/>
										{/* Q2: Private badge is a sibling OUTSIDE KnowledgeRow[role=button]
										    to avoid Playwright getByText strict-mode collision: KnowledgeRow
										    titles like "My private note" contain "private" as a substring,
										    which would cause getByText('Private') to resolve to 2 elements. */}
										{isPrivate && (
											<span
												className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-subtle)] text-[12px] bg-[var(--surface-container)] text-[var(--text-secondary)] whitespace-nowrap"
												aria-label="Private — only visible to you"
												data-testid="private-badge"
											>
												Private
											</span>
										)}
									</div>
								);
							})}
						</div>
					) : (
						<EmptyState
							title="Nothing needs attention"
							description="Triage is clear — agents will surface draft items here as they learn."
							dataTestId="knowledge-triage-empty"
						/>
					)}
				</div>
			) : (
				<div className="flex flex-col gap-2" data-testid="knowledge-curated-view">
					{apiLoading ? (
						<SkeletonList rows={4} ariaLabel="Loading curated items" />
					) : grouped.length === 0 ? (
						<>
							<EmptyState
								title="No knowledge items yet"
								description="Agents will populate this scope as they learn. Check back after the next review cycle."
								dataTestId="knowledge-curated-empty"
							/>
							{hintKnowledgeEmpty.visible && (
								<div
									role="status"
									data-testid={hintKnowledgeEmpty.testId}
									className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] flex flex-col gap-[6px] mt-2"
								>
									<p className="text-[15px] text-[var(--text-secondary)] leading-[var(--leading-body)]">
										{hintKnowledgeEmpty.copy}
									</p>
									<div className="flex gap-2">
										<button
											type="button"
											className="btn btn-ghost btn-xs text-[var(--text-tertiary)] min-h-[44px]"
											onClick={hintKnowledgeEmpty.dismiss}
										>
											Got it
										</button>
									</div>
								</div>
							)}
						</>
					) : (
						grouped.map((g) => (
							<KnowledgeTopicGroup
								key={g.topic}
								topic={g.topic}
								itemCount={g.items.length}
								staleCount={g.staleCount}
								health={g.health}
							>
								{g.items.map((item) => {
									const isPrivate = item.scopeKind === "user";
									return (
										<div key={item.id}>
											<KnowledgeRow
												title={item.title}
												layer={"L0" as KnowledgeLayer}
												kind={"brief" as KnowledgeKind}
												status={toKnowledgeStatus(item.status)}
												timestamp={relativeTime(item.updatedAt)}
												onClick={() => navigate(`/knowledge/${item.id}`)}
											/>
											{isPrivate && (
												<span
													className="inline-flex items-center px-[8px] py-[2px] rounded-[var(--r-subtle)] text-[12px] bg-[var(--surface-container)] text-[var(--text-secondary)] whitespace-nowrap"
													aria-label="Private — only visible to you"
													data-testid="private-badge"
												>
													Private
												</span>
											)}
										</div>
									);
								})}
							</KnowledgeTopicGroup>
						))
					)}
				</div>
			)}
		</div>
	);
}
