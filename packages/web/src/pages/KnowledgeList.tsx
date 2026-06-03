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
 *
 * @lore visual-parity: Page structure changed to flex flex-col h-full with
 * fixed header (non-scrolling) and flex-1 overflow-y-auto body, per AppShell
 * overflow-hidden contract. Visual treatment updated to match knowledge-list.html:
 * segmented pill tab control, outlined scope pills, plain-text sort bar,
 * inline KnowledgeListRow replacing KnowledgeRow primitive.
 */
import { EmptyState, ErrorState, SkeletonList } from "@hyperidle/design-system";
import type {
	KnowledgeScope,
	KnowledgeSortOption,
	KnowledgeStatus,
	KnowledgeTopicHealth,
} from "@hyperidle/fabric/types";
import { KNOWLEDGE_SORT_OPTIONS } from "@hyperidle/fabric/types";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";
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
	scopeKind?: string;
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

function toKnowledgeStatus(apiStatus: string): KnowledgeStatus {
	switch (apiStatus) {
		case "active":
			return "active";
		case "archived":
			return "archived";
		default:
			return "captured";
	}
}

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
				const primary = bAt.localeCompare(aAt);
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
		case "frequency":
			return copy.sort((a, b) => {
				const aCount = a.signals?.accessCount30d ?? null;
				const bCount = b.signals?.accessCount30d ?? null;
				if (aCount === null && bCount === null) return a.id.localeCompare(b.id);
				if (aCount === null) return 1;
				if (bCount === null) return -1;
				const primary = bCount - aCount;
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
		default:
			return copy.sort((a, b) => {
				const aScore = a.signals?.relevanceScore ?? null;
				const bScore = b.signals?.relevanceScore ?? null;
				if (aScore === null && bScore === null) return a.id.localeCompare(b.id);
				if (aScore === null) return 1;
				if (bScore === null) return -1;
				const primary = bScore - aScore;
				return primary !== 0 ? primary : a.id.localeCompare(b.id);
			});
	}
}

function deriveTopicHealth(totalCount: number, archivedCount: number): KnowledgeTopicHealth {
	if (totalCount === 0 || archivedCount === 0) return "fresh";
	const ratio = archivedCount / totalCount;
	if (ratio >= 0.5) return "mostly_stale";
	return "some_stale";
}

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

/**
 * Inline knowledge row matching knowledge-list.html .knowledge-row.
 * Replaces the KnowledgeRow design-system primitive for visual parity.
 */
interface KnowledgeListRowProps {
	title: string;
	preview?: string | null;
	kind?: string;
	status?: KnowledgeStatus;
	timestamp: string;
	isPrivate?: boolean;
	onClick?: () => void;
}

/**
 * Returns inline style for a knowledge kind badge.
 * Colors per mockup: Pattern → green, Decision → blue, Failure → red.
 */
function kindBadgeStyle(kind: string): { background: string; color: string } {
	const k = kind.toLowerCase();
	if (k === "pattern") {
		return { background: "var(--accent-primary-dim)", color: "var(--accent-primary)" };
	}
	if (k === "decision") {
		return {
			background: "color-mix(in oklab, var(--status-info) 8%, transparent)",
			color: "var(--status-info)",
		};
	}
	if (k === "failure") {
		return {
			background: "color-mix(in oklab, var(--status-error) 8%, transparent)",
			color: "var(--status-error)",
		};
	}
	return { background: "var(--surface-container)", color: "var(--text-secondary)" };
}

/**
 * Returns inline style for a knowledge status badge.
 * Colors per mockup: Active → green, Stale/archived → amber.
 */
function statusBadgeStyle(status: KnowledgeStatus): { background: string; color: string } | null {
	if (status === "active") {
		return { background: "var(--accent-primary-dim)", color: "var(--accent-primary)" };
	}
	if (status === "archived") {
		return {
			background: "color-mix(in oklab, var(--accent-secondary) 8%, transparent)",
			color: "var(--accent-secondary)",
		};
	}
	return null;
}

function KnowledgeListRow({
	title,
	preview,
	kind,
	status,
	timestamp,
	isPrivate,
	onClick,
}: KnowledgeListRowProps): JSX.Element {
	const kStyle = kind ? kindBadgeStyle(kind) : null;
	const sStyle = status ? statusBadgeStyle(status) : null;
	return (
		<button
			type="button"
			className="flex items-center gap-[12px] px-[24px] py-[12px] border-b border-[var(--border-subtle)] cursor-pointer last:border-b-0 hover:bg-[rgba(44,36,26,0.02)] w-full text-left"
			style={{ transition: "background 240ms ease" }}
			onClick={onClick}
		>
			<div className="flex-1 min-w-0">
				<div className="text-[15px] text-[var(--text-primary)] truncate">{title}</div>
				{preview && (
					<div className="text-[13px] text-[var(--text-tertiary)] truncate mt-[2px]">{preview}</div>
				)}
			</div>
			<div className="flex items-center gap-[6px] shrink-0">
				{isPrivate && (
					<span
						className="inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] text-[12px] font-[500] whitespace-nowrap"
						style={{ background: "var(--surface-container)", color: "var(--text-secondary)" }}
						title="Private — only visible to you"
						data-testid="private-badge"
					>
						Private
					</span>
				)}
				{kind && kStyle && (
					<span
						className="inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] text-[12px] font-[500] whitespace-nowrap"
						style={kStyle}
						data-testid="kind-badge"
					>
						{kind}
					</span>
				)}
				{status && sStyle && (
					<span
						className="inline-flex items-center px-[9px] py-[3px] rounded-[var(--r-pill)] text-[12px] font-[500] whitespace-nowrap"
						style={sStyle}
						data-testid="status-badge"
					>
						{status === "archived" ? "Stale" : status.charAt(0).toUpperCase() + status.slice(1)}
					</span>
				)}
				<span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">
					{timestamp}
				</span>
			</div>
		</button>
	);
}

interface KnowledgeListContentProps {
	tab: KnowledgeTab;
	sort: KnowledgeSortOption;
	scope: KnowledgeScope;
	scopeOptions: string[];
	selectedScopeFilter: string | null;
	onScopeFilterChange: (value: string | null) => void;
	onSortChange: (option: KnowledgeSortOption) => void;
	grouped: Array<{
		topic: string;
		items: ApiKnowledgeItem[];
		staleCount: number;
		health: KnowledgeTopicHealth;
	}>;
	triageItems: ApiKnowledgeItem[];
	apiLoading: boolean;
	apiError: string | null;
	isCuratedEmpty: boolean;
	isTriageEmpty: boolean;
	hintKnowledgeEmpty: ReturnType<typeof useHint>;
	onNavigate: (id: string) => void;
	searchQuery: string;
}

function KnowledgeListContent({
	tab,
	sort,
	scope,
	scopeOptions,
	selectedScopeFilter,
	onScopeFilterChange,
	onSortChange,
	grouped,
	triageItems,
	apiLoading,
	apiError,
	isCuratedEmpty,
	isTriageEmpty,
	hintKnowledgeEmpty,
	onNavigate,
	searchQuery,
}: KnowledgeListContentProps): JSX.Element {
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredTriageItems = normalizedQuery
		? triageItems.filter((i) => i.title.toLowerCase().includes(normalizedQuery))
		: triageItems;
	const filteredGrouped = normalizedQuery
		? grouped
				.map((g) => ({
					...g,
					items: g.items.filter((i) => i.title.toLowerCase().includes(normalizedQuery)),
				}))
				.filter((g) => g.items.length > 0)
		: grouped;
	return (
		<div className="max-w-[800px] mx-auto w-full">
			<fieldset
				className="flex items-center gap-[6px] flex-wrap px-[24px] pt-[12px] border-none p-0 m-0"
				data-testid="knowledge-scope-pills"
				aria-label="Filter by scope"
			>
				<button
					type="button"
					data-testid="scope-pill-all"
					data-active={selectedScopeFilter === null ? "true" : "false"}
					className={
						selectedScopeFilter === null
							? "border-[1.5px] border-[var(--accent-primary)] bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)] px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-pointer"
							: "border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-pointer bg-transparent"
					}
					onClick={() => onScopeFilterChange(null)}
				>
					All
				</button>
				{scopeOptions.map((scopeKind) => {
					const isActive = selectedScopeFilter === scopeKind;
					return (
						<button
							key={scopeKind}
							type="button"
							data-testid={`scope-pill-${scopeKind.toLowerCase()}`}
							data-active={isActive ? "true" : "false"}
							className={
								isActive
									? "border-[1.5px] border-[var(--accent-primary)] bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)] px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-pointer"
									: "border-[1.5px] border-[var(--border-default)] text-[var(--text-secondary)] px-[12px] py-[4px] rounded-[var(--r-pill)] text-[12px] font-[500] cursor-pointer bg-transparent"
							}
							onClick={() =>
								onScopeFilterChange(selectedScopeFilter === scopeKind ? null : scopeKind)
							}
						>
							{scopeKind}
						</button>
					);
				})}
			</fieldset>

			<span data-testid="knowledge-scope-indicator" className="sr-only">
				{scope}
			</span>

			<div
				role="radiogroup"
				aria-label="Sort order"
				data-testid="knowledge-sort-bar"
				className="flex items-center gap-[9px] px-[24px] py-[9px]"
			>
				<span className="text-[12px] text-[var(--text-tertiary)]">Sort:</span>
				{KNOWLEDGE_SORT_OPTIONS.map((option) => {
					const isActive = sort === option;
					return (
						// biome-ignore lint/a11y/useSemanticElements: custom radio group uses button+role=radio pattern for aria-checked support
						<button
							key={option}
							type="button"
							role="radio"
							aria-checked={isActive}
							onClick={() => onSortChange(option)}
							className={
								isActive
									? "text-[12px] text-[var(--accent-primary)] font-[600] cursor-pointer bg-transparent border-none capitalize"
									: "text-[12px] text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none capitalize"
							}
						>
							{option}
						</button>
					);
				})}
			</div>

			{tab === "triage" ? (
				<div className="flex flex-col" data-testid="knowledge-triage-view">
					{apiLoading ? (
						<div className="px-[24px] py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading triage items" />
						</div>
					) : apiError ? (
						<div className="px-[24px] py-[12px]">
							<ErrorState title="Couldn't load knowledge" description={apiError} />
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
						filteredTriageItems.map((item) => {
							const isPrivate = item.scopeKind === "user";
							return (
								<KnowledgeListRow
									key={item.id}
									title={item.title}
									preview={item.body?.slice(0, 120) || null}
									status={toKnowledgeStatus(item.status)}
									timestamp={relativeTime(item.updatedAt)}
									isPrivate={isPrivate}
									onClick={() => onNavigate(item.id)}
								/>
							);
						})
					)}
				</div>
			) : (
				<div className="flex flex-col" data-testid="knowledge-curated-view">
					{apiLoading ? (
						<div className="px-[24px] py-[12px]">
							<SkeletonList rows={4} ariaLabel="Loading curated items" />
						</div>
					) : isCuratedEmpty ? (
						<div className="flex items-center justify-center p-[48px_24px]">
							<EmptyState
								title="No knowledge items yet"
								description="Agents will populate this scope as they learn. Check back after the next review cycle."
								dataTestId="knowledge-curated-empty"
							/>
							{hintKnowledgeEmpty.visible && (
								<div
									role="status"
									data-testid={hintKnowledgeEmpty.testId}
									className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[18px] flex flex-col gap-[6px] mt-[12px]"
								>
									<p className="text-[15px] text-[var(--text-secondary)] leading-[var(--leading-body)]">
										{hintKnowledgeEmpty.copy}
									</p>
									<div className="flex gap-[9px]">
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
						</div>
					) : (
						filteredGrouped.map((g) => (
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
										<KnowledgeListRow
											key={item.id}
											title={item.title}
											preview={item.body?.slice(0, 120) || null}
											status={toKnowledgeStatus(item.status)}
											timestamp={relativeTime(item.updatedAt)}
											isPrivate={isPrivate}
											onClick={() => onNavigate(item.id)}
										/>
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

export interface KnowledgeListProps {
	loading?: boolean;
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

	const [tab, setTab] = useState<KnowledgeTab>("triage");
	const tabManuallySelectedRef = useRef(false);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [fetchRevision, setFetchRevision] = useState(0);
	const [selectedScopeFilter, setSelectedScopeFilter] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

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

	const scopeOptions = useMemo<string[]>(() => {
		const seen = new Set<string>();
		for (const item of allItems) {
			if (item.scopeKind && item.scopeKind !== "user") {
				seen.add(item.scopeKind);
			}
		}
		return Array.from(seen).sort();
	}, [allItems]);

	const triageItems = useMemo<ApiKnowledgeItem[]>(
		() =>
			sortApiItems(
				allItems.filter((i) => i.status === "draft"),
				sort,
			),
		[allItems, sort],
	);

	const curatedItems = useMemo<ApiKnowledgeItem[]>(
		() => allItems.filter((i) => i.status === "active"),
		[allItems],
	);

	const grouped = useMemo(() => groupByTopic(curatedItems), [curatedItems]);

	const prevScopeRef = useRef(scope);
	useEffect(() => {
		if (prevScopeRef.current !== scope) {
			tabManuallySelectedRef.current = false;
			prevScopeRef.current = scope;
		}
		if (tabManuallySelectedRef.current) return;
		const hasDraft = allItems.some((i) => i.status === "draft");
		setTab(hasDraft ? "triage" : "curated");
	}, [allItems, scope]);

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
			<div className="flex flex-col h-full" data-testid="knowledge-list-page">
				<SkeletonList rows={6} ariaLabel="Loading knowledge" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col h-full" data-testid="knowledge-list-page">
				<ErrorState
					title="Couldn't load knowledge"
					description={error.message}
					onRetry={error.onRetry}
				/>
			</div>
		);
	}

	const systemEmpty = allItems.length === 0 && !apiLoading;
	const isCuratedEmpty = grouped.length === 0 && !apiLoading;
	const isTriageEmpty = triageItems.length === 0 && !apiLoading;

	return (
		<div className="flex flex-col h-full" data-testid="knowledge-list-page">
			{/* Header: when systemEmpty, show only the title.
			    When populated, show tabs + search + "New" button. */}
			<header className="shrink-0 flex items-center justify-between px-[24px] py-[18px] border-b border-[var(--border-subtle)]">
				<div className="flex items-center gap-[12px]">
					<span className="sr-only">Knowledge Base</span>
					<h2 className="text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)]">
						Knowledge
					</h2>
					{/* Curated/Triage tabs — hidden when knowledge base is empty */}
					{!systemEmpty && (
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
								className={
									tab === "curated"
										? "px-[12px] py-[6px] rounded-[var(--r-pill)] text-[13px] font-[600] bg-[var(--surface-elevated)] text-[var(--accent-primary)] shadow-[var(--shadow-subtle)] cursor-pointer border-none"
										: "px-[12px] py-[6px] rounded-[var(--r-pill)] text-[13px] font-[500] text-[var(--text-secondary)] cursor-pointer border-none bg-transparent"
								}
								onClick={() => {
									tabManuallySelectedRef.current = true;
									setTab("curated");
								}}
							>
								Curated
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={tab === "triage"}
								className={
									tab === "triage"
										? "px-[12px] py-[6px] rounded-[var(--r-pill)] text-[13px] font-[600] bg-[var(--surface-elevated)] text-[var(--accent-primary)] shadow-[var(--shadow-subtle)] cursor-pointer border-none"
										: "px-[12px] py-[6px] rounded-[var(--r-pill)] text-[13px] font-[500] text-[var(--text-secondary)] cursor-pointer border-none bg-transparent"
								}
								onClick={() => {
									tabManuallySelectedRef.current = true;
									setTab("triage");
								}}
							>
								Triage
							</button>
						</div>
					)}
				</div>
				{/* Search + New — hidden when knowledge base is empty */}
				{!systemEmpty && (
					<div className="flex items-center gap-[9px]">
						{/* Visual parity: search input between tabs and + New button */}
						{/* hearth-internal-padding */}
						<input
							type="search"
							aria-label="Search knowledge"
							data-testid="knowledge-search"
							placeholder="Search…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							style={{
								width: "200px",
								borderRadius: "var(--r-pill)",
								border: "1.5px solid var(--border-default)",
								padding: "7px 12px",
								fontSize: "13px",
								background: "var(--surface-page)",
								color: "var(--text-primary)",
								outline: "none",
							}}
						/>
						<button
							type="button"
							className="inline-flex items-center text-[12px] font-[500] px-[12px] py-[7px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] border-none cursor-pointer"
							onClick={() => setCreateDialogOpen(true)}
						>
							+ New
						</button>
					</div>
				)}
			</header>

			<KnowledgeCreateDialog
				open={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onCreated={handleCreated}
			/>

			<div className="flex-1 overflow-y-auto">
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
								<button
									type="button"
									className="inline-flex items-center text-[13px] font-[500] px-[18px] py-[10px] rounded-[var(--r-pill)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] border-none cursor-pointer"
									onClick={() => setCreateDialogOpen(true)}
								>
									Create first item
								</button>
							}
							dataTestId="knowledge-curated-empty"
						/>
					</div>
				) : (
					<KnowledgeListContent
						tab={tab}
						sort={sort}
						scope={scope}
						scopeOptions={scopeOptions}
						selectedScopeFilter={selectedScopeFilter}
						onScopeFilterChange={setSelectedScopeFilter}
						onSortChange={handleSortChange}
						grouped={grouped}
						triageItems={triageItems}
						apiLoading={apiLoading}
						apiError={apiError}
						isCuratedEmpty={isCuratedEmpty}
						isTriageEmpty={isTriageEmpty}
						hintKnowledgeEmpty={hintKnowledgeEmpty}
						onNavigate={(id) => navigate(`/knowledge/${id}`)}
						searchQuery={searchQuery}
					/>
				)}
			</div>
		</div>
	);
}
