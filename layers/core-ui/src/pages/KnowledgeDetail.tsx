/**
 * Knowledge/Detail page (J7) — metadata bar, markdown body, observation log,
 * related-items sidebar. Edit mode is a React state toggle, NOT a route.
 *
 * @lore J7: data comes from a merged view — legacy k1/k2 entries keep their
 * pre-J7 free-form `layer`/`kind` values (the protected KnowledgeDetail tests
 * depend on "company" and "belief" string labels) while everything else is
 * sourced from `fixtures/knowledge-data.ts`. When the API lands, swap the
 * lookup for a fetched item and keep the render tree unchanged.
 *
 * @lore L23: body rendering replaced — the `<pre>` shell (J7 markdown lore)
 * is gone. `KnowledgeBody` drives both the saved view and the edit preview.
 * `DOMPurify` is no longer imported here; it lives inside `KnowledgeBody`
 * as a fixed, non-parametrised sanitiser per architecture.md § 2.
 *
 * @lore J7 edit mode: textarea state is local only — no API call on Save. The
 * persisted body lives in component state; Cancel discards the draft and
 * re-opening Edit shows the last saved value. Refresh resets to the fixture.
 *
 * @lore L23 R1: LEGACY_DETAILS constants are kept because the protected
 * KnowledgeDetail.test.tsx asserts "company" and "belief" string labels that
 * live only in LEGACY_DETAILS (the fixture k1 uses layer:"L0", kind:"decision").
 * The <pre> rendering path is gone; the data remains for the protected tests.
 * Full deletion is deferred to L25 (Save-actually-persists) when the data layer
 * replaces the fixture lookup entirely.
 *
 * @lore L18: ObservationLog replaced by HostThreadSection. Block popover wiring
 * added (same pattern as WorkBet). KnowledgeBody extended with onOpenBlockActions
 * and messagesByBlockId for inline anchored messages.
 *
 * @lore T2: textarea+preview editing replaced by BodyEditor with auto-save via
 * PATCH /api/knowledge/:id. Save/Cancel replaced by Done button. useAutoSave
 * manages the debounce, status machine (idle/saving/saved/error/conflict) and
 * version tracking. useKnowledgeItem fetches live data; falls back to fixtures
 * so existing protected tests stay green. BodyEditor is mocked in page-level
 * tests because TipTap requires DOM APIs unavailable in JSDOM.
 *
 * @lore T2 F3: dirty-check in handleContentChange — skip triggerSave when
 * content matches editContent to prevent spurious saves on BodyEditor mount
 * (TipTap fires onChange with initial content on mount).
 */
import type {
	KnowledgeRole,
	Message,
	PlainPayloadWithBlockId,
	ScopeKind,
} from "@hyperidle/domain-model";
import {
	isRedactedPayload,
	KNOWLEDGE_ROLES,
	KNOWLEDGE_STATUSES,
	type KnowledgeScope,
	type KnowledgeStatus,
	SCOPE_KINDS,
} from "@hyperidle/domain-model";
import { type JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link as RRLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { AssistantContext } from "../contexts/AssistantContext.js";
import type { MenuItem } from "../ds";
import {
	BlockActionsPopover,
	BodyEditor,
	Breadcrumb,
	Button,
	EmptyState,
	knowledgeStatusToStatus,
	Menu,
	PageHeader,
	PageScaffold,
	SectionLabel,
	Select,
	SkeletonCard,
	StatusChip,
} from "../ds";
// eslint-disable-next-line design/no-mock-data-import -- tracked in #93
import { knowledgeItems, type MockKnowledgeItem } from "../fixtures/knowledge-data";
import { useAutoSave } from "../hooks/useAutoSave.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useHostThread } from "../hooks/useHostThread.js";
import { useKnowledgeItem } from "../hooks/useKnowledgeItem.js";
import { useTeams } from "../hooks/useTeams.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { apiFetch } from "../services/api-fetch.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import { scopeKindToLabel } from "../utils/scope-labels.js";
import { absoluteDateTime } from "../utils/time.js";

import { KnowledgeBody } from "./knowledge/KnowledgeBody";
import { ScopeChangeDialog } from "./knowledge/ScopeChangeDialog";

/**
 * @lore I4 S5: previously a local `knowledgeStatusToChipStatus` switch
 * existed here; deleted in favour of the canonical
 * `knowledgeStatusToStatus` from `components/status-mapping.ts`.
 */

/**
 * Merged detail shape — widens layer/kind to `string` so the legacy k1/k2
 * values ("company", "belief") can render alongside the fixture's typed
 * unions. Downstream rendering treats these as opaque labels.
 */
interface DetailItem {
	id: string;
	title: string;
	layer: string;
	/** AF13 §5: kind is optional — undefined renders as "—" in the metadata aside */
	kind?: string;
	status: KnowledgeStatus;
	timestamp: string;
	content: string;
	scope?: KnowledgeScope;
	originAgent?: string;
	confidence?: number;
	version?: string;
	/** Q2: numeric version for scope mutation optimistic concurrency. Defaults to 1. */
	versionNum?: number;
	/** Q2: scope_kind column. Defaults to "factory" for pre-Q2 items. */
	scopeKind?: ScopeKind;
	/** What context assembly does with this document. Absent means `ordinary`. */
	role?: KnowledgeRole;
	relatedItems?: ReadonlyArray<string>;
	/** W3 AC-41: structured related items with title (from API) */
	structuredRelatedItems?: ReadonlyArray<{ id: string; title: string }>;
	topic?: string;
	/** W3 AC-40: 30-day access count from API */
	accessCount?: number;
	/** W3 AC-40: last editor name */
	updatedBy?: string;
	/** AV3: resolved human-readable scope name — from server, response-only */
	scopeName?: string;
}

/**
 * Legacy k1/k2 payloads — pinned to the pre-J7 detail fixture values so the
 * protected `KnowledgeDetail.test.tsx` assertions stay green. The J7 fields
 * (observationLog, relatedItems, etc.) are appended here.
 */
// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
const LEGACY_DETAILS: Record<string, DetailItem> = {
	k1: {
		id: "k1",
		title: "Architecture Decision: Auth Strategy",
		layer: "company",
		kind: "belief",
		status: "active",
		timestamp: "1d ago",
		content:
			"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes. Refresh tokens in 7 days. All tokens stored in httpOnly cookies, never localStorage.",
		scope: "practice",
		originAgent: "Architect Agent",
		confidence: 0.92,
		topic: "Architecture",
		relatedItems: ["k2", "k7"],
	},
	k2: {
		id: "k2",
		title: "API Rate Limiting Best Practices",
		layer: "product",
		kind: "fact",
		status: "active",
		timestamp: "2d ago",
		content:
			"Rate limiting at 100 requests/minute per API key. Sliding window algorithm. Returns 429 with Retry-After header. Exemptions for internal service accounts.",
		scope: "practice",
		originAgent: "Developer Agent",
		confidence: 0.78,
		topic: "Architecture",
		relatedItems: ["k1"],
	},
	/**
	 * AV3: team-scoped item with a resolved scopeName — exercises the scope-name
	 * headline state (scope row + breadcrumb segment showing "Team Nimmly").
	 * scopeName is response-only (never persisted); story fixture inlines it directly
	 * because the story runs without a real API and the fixture path skips resolveScopeName.
	 */
	// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
	"k-team-scoped": {
		id: "k-team-scoped",
		title: "Team Knowledge: Nimmly Onboarding Guide",
		layer: "L1",
		kind: "pattern",
		status: "active",
		timestamp: "3d ago",
		content: "Steps for onboarding new team members to the Nimmly workspace.",
		scope: "practice",
		originAgent: "Onboarding Agent",
		confidence: 0.85,
		topic: "Onboarding",
		scopeKind: "team",
		scopeName: "Team Nimmly",
	},
	/**
	 * AK5: archived knowledge item fixture used by the "Promote to bet" disabled test.
	 * status:"archived" causes the promote menu item to be disabled (aria-disabled="true").
	 */
	// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
	"k-archived": {
		id: "k-archived",
		title: "Archived Decision",
		layer: "company",
		kind: "belief",
		status: "archived",
		timestamp: "7d ago",
		content: "This item was archived.",
		scope: "practice",
		originAgent: "Architect Agent",
		confidence: 0.5,
		topic: "Architecture",
	},
};

/**
 * Legacy source strings — preserved verbatim so the protected test can find
 * them in the rendered output. Rendered in a KeyValue pair under the header.
 */
// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
const LEGACY_SOURCES: Record<string, string> = {
	k1: "Architecture review session, Architect Agent",
	k2: "API design document, Developer Agent",
};

// eslint-disable-next-line design/no-mock-data-symbol -- tracked in #93
const FALLBACK_DETAIL: DetailItem = {
	id: "unknown",
	title: "Unknown Knowledge Item",
	layer: "unknown",
	kind: "unknown",
	status: "provisional",
	timestamp: "—",
	content: "This knowledge item was not found.",
};

function formatConfidence(score: number | undefined): string {
	if (score === undefined) return "n/a";
	return `${Math.round(score * 100)}%`;
}

/**
 * Narrows a raw string from the API to KnowledgeStatus.
 * Falls back to "provisional" so the render never crashes on unknown values.
 */
function toKnowledgeStatus(raw: string): KnowledgeStatus {
	const statuses: ReadonlyArray<string> = KNOWLEDGE_STATUSES;
	return statuses.includes(raw) ? (raw as KnowledgeStatus) : "provisional";
}

/**
 * Reader-facing names for the four document roles. `roleLabel` in
 * `@hyperidle/domain-model` is for AGENT role ids and is a different vocabulary
 * entirely — the two must not be confused.
 */
const KNOWLEDGE_ROLE_LABEL: Record<KnowledgeRole, string> = {
	ordinary: "Knowledge",
	skill: "Skill",
	rule: "Rule",
	agent_file: "Agent file",
};

/**
 * Narrows a raw string from the API to ScopeKind.
 * Falls back to "factory" so the render defaults to the most restrictive scope.
 */
function toScopeKind(raw: string): ScopeKind {
	const kinds: ReadonlyArray<string> = SCOPE_KINDS;
	return kinds.includes(raw) ? (raw as ScopeKind) : "factory";
}

function fromFixture(item: MockKnowledgeItem): DetailItem {
	return {
		id: item.id,
		title: item.title,
		layer: item.layer,
		kind: item.kind,
		status: item.status,
		timestamp: item.timestamp,
		content: item.content ?? "",
		scope: item.scope,
		originAgent: item.originAgent,
		confidence: item.confidence,
		version: item.version,
		relatedItems: item.relatedItems,
		topic: item.topic,
	};
}

function findDetail(id: string | undefined): DetailItem | undefined {
	if (!id) return undefined;
	if (LEGACY_DETAILS[id]) return LEGACY_DETAILS[id];
	const fixture = knowledgeItems.find((i) => i.id === id);
	return fixture ? fromFixture(fixture) : undefined;
}

function findRelated(item: DetailItem): ReadonlyArray<MockKnowledgeItem> {
	const explicit = new Set(item.relatedItems ?? []);
	const byTopic = item.topic
		? knowledgeItems.filter(
				(i) => i.id !== item.id && i.topic === item.topic && i.scope === item.scope,
			)
		: [];
	const merged = new Map<string, MockKnowledgeItem>();
	for (const id of explicit) {
		const match = knowledgeItems.find((i) => i.id === id);
		if (match) merged.set(match.id, match);
	}
	for (const i of byTopic) merged.set(i.id, i);
	return Array.from(merged.values());
}

export interface KnowledgeDetailProps {
	/**
	 * Override the knowledge id resolved from route params. Used by design
	 * system stories which render outside the /knowledge/:knowledgeId route.
	 */
	overrideKnowledgeId?: string;
	overrideHash?: string;
	presentation?: "page" | "pane";
}

export function KnowledgeDetail({
	overrideKnowledgeId,
	overrideHash,
	presentation = "page",
}: KnowledgeDetailProps = {}): JSX.Element {
	const { knowledgeId: routeKnowledgeId } = useParams<{ knowledgeId: string }>();
	const knowledgeId = overrideKnowledgeId ?? routeKnowledgeId;

	// T2: Fetch from API, fall back to fixture data so existing tests stay green.
	// @lore T2: Dual data source — API item takes priority over fixture. Fixture
	// items (k1, k2, k11, k12) are used when the API returns null (test env or
	// when item doesn't exist in the DB). Full fixture removal deferred to a
	// future workpackage once tests are migrated to seeded DB data.
	const { data: apiItem, isLoading: apiLoading } = useKnowledgeItem(knowledgeId);
	const fixtureItem = findDetail(knowledgeId);

	// @lore UI-knowledge-loading: while the API call is in flight both apiItem and
	// fixtureItem are null/undefined for real (non-fixture) ids. Without the loading
	// guard the component falls through to FALLBACK_DETAIL which boldly claims
	// "Unknown Knowledge Item / This knowledge item was not found." — a confident
	// not-found claim during a transient loading state. Show a skeleton instead.
	if (apiLoading && !fixtureItem) {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Knowledge" />}>
				<div className="flex flex-col gap-[12px] p-[24px]">
					<SkeletonCard ariaLabel="Loading knowledge item" />
					<SkeletonCard ariaLabel="Loading knowledge body" />
				</div>
			</PageScaffold>
		);
	}

	let item: DetailItem;
	if (apiItem) {
		item = {
			id: apiItem.id,
			title: apiItem.title,
			layer: apiItem.layer ?? "unknown",
			kind: apiItem.kind,
			status: toKnowledgeStatus(apiItem.status),
			timestamp: apiItem.updatedAt,
			content: apiItem.body,
			versionNum: apiItem.version,
			scopeKind: toScopeKind(apiItem.scopeKind),
			role: apiItem.role,
			confidence: apiItem.confidence,
			accessCount: apiItem.accessCount,
			updatedBy: apiItem.updatedBy,
			structuredRelatedItems: apiItem.relatedItems,
			// AV3 WARNING-A3: must assign on the object, not only on the interface.
			scopeName: apiItem.scopeName,
		};
	} else {
		item = fixtureItem ?? FALLBACK_DETAIL;
	}

	const legacySource = knowledgeId !== undefined ? LEGACY_SOURCES[knowledgeId] : undefined;
	// Q2: Pass the route-resolved knowledgeId to the view so ScopeChangeDialog
	// uses the actual route param for the PATCH URL, not item.id from fixture data
	// (FALLBACK_DETAIL.id would be "unknown" for non-fixture item IDs).
	const hasRealData = apiItem !== null || fixtureItem !== undefined;
	const viewKey = `${knowledgeId}-${hasRealData ? "loaded" : "fallback"}`;
	return (
		<KnowledgeDetailView
			key={viewKey}
			item={item}
			legacySource={legacySource}
			routeKnowledgeId={knowledgeId}
			overrideHash={overrideHash}
			presentation={presentation}
		/>
	);
}

// AG4: KnowledgeDetailBreadcrumb local fn deleted — replaced by DS Breadcrumb in KnowledgeDetailView.

/** Backlinks card shown in the aside */
function BacklinksCard({
	structuredRelatedItems,
	relatedItems,
}: {
	structuredRelatedItems?: ReadonlyArray<{ id: string; title: string }>;
	relatedItems: ReadonlyArray<MockKnowledgeItem>;
}): JSX.Element {
	const items =
		structuredRelatedItems && structuredRelatedItems.length > 0
			? structuredRelatedItems.map((ri) => ({ id: ri.id, title: ri.title }))
			: relatedItems.map((ri) => ({ id: ri.id, title: ri.title }));
	return (
		<div
			data-testid="knowledge-backlinks-card"
			className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px]"
		>
			<SectionLabel label="Backlinks" as="h2" />
			{items.length > 0 ? (
				<ul className="flex flex-col">
					{items.map((ri) => (
						<li key={ri.id} data-testid="related-item">
							<RRLink
								to={`/knowledge/${ri.id}`}
								className="type-control flex items-center gap-[9px] py-[6px]  text-[var(--accent-deep)] hover:underline cursor-pointer"
							>
								{ri.title}
							</RRLink>
						</li>
					))}
				</ul>
			) : (
				/* UI-021: use EmptyState compact for consistency */
				<EmptyState
					compact
					title="No backlinks"
					description="Related and same-topic items will appear here."
				/>
			)}
		</div>
	);
}

/**
 * Overflow menu ("···") for non-edit mode actions.
 *
 * @lore AD6: Flag removed — it is an agent operation, not user-facing.
 * Archive wired to POST /api/knowledge/:id/archive (was a stub).
 */
/**
 * @lore AG5: KnowledgeOverflowMenu refactored to render through <Menu> (C1 single-owner).
 * The overflowRef and the document-level click-outside/Escape effects in the parent
 * (KnowledgeDetail lines ~485-501) are now handled by Menu internally — those effects
 * are removed from KnowledgeDetail below.
 * data-testid="knowledge-overflow-menu" placed on a conditional wrapper so the E2E
 * locator disappears from DOM when closed (not.toBeVisible() passes).
 */
function KnowledgeOverflowMenu({
	overflowOpen,
	onToggle,
	onClose,
	onArchive,
	onChangeScope,
	onPromoteToBet,
	archiving,
	itemStatus,
	isReadOnly,
}: {
	overflowOpen: boolean;
	onToggle: () => void;
	onClose: () => void;
	onArchive: () => void;
	onChangeScope: () => void;
	onPromoteToBet: () => void;
	archiving: boolean;
	/** AK5: used to disable "Promote to bet" when item is archived. */
	itemStatus: string;
	/**
	 * AV3 WARNING-D2: gate the "Change scope" item behind !isReadOnly so the
	 * read-only state is coherent — no scope-change affordance anywhere on a
	 * read-only/factory item. Presentation-only; no server gate added (WARNING-A4).
	 */
	isReadOnly: boolean;
}): JSX.Element {
	const changeScopeItem: MenuItem = {
		id: "change-scope",
		label: "Change scope",
		onSelect: onChangeScope,
		dataAttrs: { "data-testid": "knowledge-change-scope" },
	};

	const items: MenuItem[] = [
		{
			id: "archive",
			label: archiving ? "Archiving…" : "Archive",
			onSelect: onArchive,
			disabled: archiving,
			dataAttrs: { "data-testid": "knowledge-archive" },
		},
		{
			// AK5: promote-to-bet action — disabled when item is archived.
			id: "promote-bet",
			label: "Promote to bet",
			onSelect: onPromoteToBet,
			disabled: itemStatus === "archived",
			dataAttrs: { "data-testid": "knowledge-promote-bet" },
		},
		// AV3: only include change-scope for editable items (WARNING-D2 coherence fix).
		...(isReadOnly ? [] : [changeScopeItem]),
	];

	return (
		<div className="relative">
			<button
				type="button"
				aria-label="More options"
				aria-expanded={overflowOpen}
				aria-haspopup="menu"
				/* AI5 AQ-015: hit-area expansion only (AG5 menu trigger stays a button). */
				className="border-width-default inline-flex items-center justify-center w-[32px] h-[32px] min-h-[44px] min-w-[44px] xl:min-h-[32px] xl:min-w-[32px] rounded-[var(--r-pill)] border-[var(--border-default)] bg-[var(--surface-elevated)] text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent-deep)] hover:text-[var(--text-primary)]"
				onClick={onToggle}
			>
				<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[16px] w-[16px]">
					<circle cx="3" cy="8" r="1" fill="currentColor" />
					<circle cx="8" cy="8" r="1" fill="currentColor" />
					<circle cx="13" cy="8" r="1" fill="currentColor" />
				</svg>
			</button>
			{/* Conditional wrapper carries the testid — disappears when closed so
			    E2E not.toBeVisible() passes (Menu renders null when open=false but
			    we need the testid on a DOM node that appears/disappears with the menu). */}
			{overflowOpen && (
				<div data-testid="knowledge-overflow-menu">
					<Menu
						open={overflowOpen}
						onClose={onClose}
						label="Knowledge actions"
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

interface KnowledgeDetailViewProps {
	item: DetailItem;
	legacySource?: string;
	/** Q2: The route-resolved knowledge id. Supersedes item.id for API calls. */
	routeKnowledgeId?: string;
	overrideHash?: string;
	presentation?: "page" | "pane";
}

function KnowledgeDetailView({
	item,
	legacySource,
	routeKnowledgeId,
	overrideHash,
	presentation = "page",
}: KnowledgeDetailViewProps): JSX.Element {
	// Q2: Use the route-resolved id for API calls to avoid FALLBACK_DETAIL.id = "unknown"
	const effectiveKnowledgeId = routeKnowledgeId ?? item.id;
	// AD6: navigate after successful archive
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();
	// T4: AssistantContext for block share action
	const { overlayOpen, attachContext } = useContext(AssistantContext);
	const isFactory = item.scope === "factory" || item.scopeKind === "factory";
	const amendableBanner = isFactory && item.status === "needs_human";
	const initialContent = item.content ?? "";
	const [savedContent, setSavedContent] = useState<string>(initialContent);
	const [editing, setEditing] = useState(false);
	// T2: editContent captures body at edit-start time (consumed once by BodyEditor on mount)
	const [editContent, setEditContent] = useState<string>(initialContent);

	// AM5 T8: block-anchored scroll (AC2). Read hash → parse #block-<id> → scroll DERIVED block.
	// @lore AM5 T8: Security — blockId is matched by VALUE comparison against data-block-id
	// attributes, never concatenated into a querySelector string (selector-injection guard).
	// scrollIntoView?.() is the optional-call guard (jsdom leaves it undefined; precedent
	// HostThreadSection.tsx, WorkBet.tsx). React 18: schedule via rAF so the KnowledgeBody
	// render is complete (https://react.dev/reference/react/useEffect).
	const { hash: routeHash } = useLocation();
	const hash = overrideHash ?? routeHash;
	// biome-ignore lint/correctness/useExhaustiveDependencies: savedContent triggers re-scroll after content changes (blocks re-render with new data-block-id attrs)
	useEffect(() => {
		if (!hash.startsWith("#block-")) return;
		const decoded = decodeURIComponent(hash.slice("#block-".length));
		if (!decoded) return;
		const raf = requestAnimationFrame(() => {
			const el = Array.from(document.querySelectorAll("[data-block-id]")).find(
				(node) => node.getAttribute("data-block-id") === decoded,
			);
			(el as HTMLElement | undefined)?.scrollIntoView?.({ block: "start" });
		});
		return () => cancelAnimationFrame(raf);
	}, [hash, savedContent]);

	// Q2: Scope change dialog state.
	const [scopeChangeOpen, setScopeChangeOpen] = useState(false);

	// AD6: Archive in-flight state + error.
	const [archiving, setArchiving] = useState(false);
	const [archiveError, setArchiveError] = useState<string | null>(null);

	// AK5: Promote-to-bet error.
	const [promoteError, setPromoteError] = useState<string | null>(null);

	// AK5: team resolution for single-team promote (avoids team-picker dialog).
	// Defensively handle undefined return (e.g. test environments where mock returns undefined).
	const useTeamsResult = useTeams();
	const teamsData = useTeamsResult?.data ?? null;

	// W3 NB-4: overflow menu open state.
	// AG5: click-outside + Escape now handled by Menu internally — removed the duplicated effects.
	const [overflowOpen, setOverflowOpen] = useState(false);

	const closeOverflow = useCallback((): void => setOverflowOpen(false), []);

	// L18: Block popover state
	const [openBlockId, setOpenBlockId] = useState<string | null>(null);
	const [threadPrefill, setThreadPrefill] = useState<
		{ blockId: string; blockExcerpt: string } | undefined
	>(undefined);

	// L18: Fetch the host thread for inline anchored messages
	const { data: threadData } = useHostThread("knowledge_item", item.id);

	// T2: Auto-save version tracking
	const [version, setVersion] = useState<number>(item.versionNum ?? 1);
	const [role, setRole] = useState<KnowledgeRole>(item.role ?? "ordinary");
	const [savingRole, setSavingRole] = useState(false);
	const [roleError, setRoleError] = useState<string | null>(null);
	const [conflictVersion, setConflictVersion] = useState<number | null>(null);

	/**
	 * T2 F-ARCH-1: Track the latest editor content in a ref so onSaved can use
	 * the actually-saved value rather than the edit-start snapshot in editContent.
	 * editContent is set once in startEdit() and never updated during editing,
	 * so using it in onSaved would put stale content into savedContent.
	 *
	 * @lore T2 F-ARCH-1: The reviewer found that onSaved was calling
	 * setSavedContent(editContent) where editContent is a closure over the
	 * edit-start snapshot. latestContentRef always holds the most-recent onChange
	 * value so Done shows the user what was actually persisted.
	 */
	const latestContentRef = useRef<string>("");

	// T2: Current user for updatedBy
	const { user } = useCurrentUser();

	// AF13 §2: self-authored factory items are editable; agent-authored factory items
	// remain read-only.
	// Predicate: editable only when BOTH updatedBy is the current user AND user is loaded.
	// When either is absent (fixture items with no updatedBy, or user not yet loaded),
	// factory items default to read-only to preserve the invariant.
	// @lore AF13: Previously isFactory unconditionally suppressed the Edit button.
	// The fix: allow edit when isFactory AND user is known AND updatedBy === user.id.
	// Self-created factory items (the default human-create scope) are editable.
	// Declared after useCurrentUser() so user is guaranteed in scope.
	const isSelfAuthoredFactory =
		isFactory && user !== null && item.updatedBy !== undefined && item.updatedBy === user.id;
	const isReadOnly = isFactory && !isSelfAuthoredFactory;

	// T2: Auto-save hook wiring
	const { status: saveStatus, save: triggerSave } = useAutoSave({
		endpoint: `/api/knowledge/${effectiveKnowledgeId}`,
		version,
		updatedBy: user?.id ?? "human",
		onSaved: (newVersion) => {
			setVersion(newVersion);
			setSavedContent(latestContentRef.current);
		},
		onConflict: ({ currentVersion }) => setConflictVersion(currentVersion),
	});

	const messagesByBlockId = useMemo((): ReadonlyMap<string, ReadonlyArray<Message>> => {
		const map = new Map<string, Message[]>();
		if (!threadData?.messages) return map;
		for (const msg of threadData.messages) {
			if (msg.type !== "plain") continue;
			if (isRedactedPayload(msg.payload)) continue;
			const blockId = (msg.payload as PlainPayloadWithBlockId).blockId;
			if (!blockId) continue;
			const existing = map.get(blockId) ?? [];
			map.set(blockId, [...existing, msg]);
		}
		return map;
	}, [threadData?.messages]);

	const related = useMemo(() => findRelated(item), [item]);

	function startEdit(): void {
		latestContentRef.current = savedContent;
		setEditContent(savedContent);
		setEditing(true);
		setConflictVersion(null);
	}

	function exitEdit(): void {
		setEditing(false);
	}

	/**
	 * T2: onChange handler for BodyEditor.
	 * @lore T2 F3: dirty-check — skip triggerSave when markdown matches
	 * editContent to prevent auto-save on BodyEditor mount (TipTap fires
	 * onChange with initial content on first render).
	 * @lore T2 F-ARCH-1: always update latestContentRef so onSaved can
	 * setSavedContent with the actually-typed value, not the edit-start snapshot.
	 */
	function handleContentChange(markdown: string): void {
		latestContentRef.current = markdown;
		if (markdown === editContent) return;
		triggerSave(markdown);
	}

	/**
	 * AD6: Archive handler — calls POST /api/knowledge/:id/archive.
	 * On success, navigates to /knowledge list. On failure, shows inline error.
	 * @lore AD6: Archive was previously a stub (closeOverflow only). Now wired
	 * to a real POST endpoint. The archive endpoint has no request body.
	 */
	/**
	 * Save a new role. The version travels with it so the server's optimistic
	 * check can reject a stale edit, exactly as the body auto-save and the scope
	 * dialog already do; the local version advances on success so a second change
	 * in the same sitting is not rejected as stale.
	 */
	async function handleRoleChange(nextRole: KnowledgeRole): Promise<void> {
		if (nextRole === role) return;
		setSavingRole(true);
		setRoleError(null);
		try {
			const res = await apiFetch(`/api/knowledge/${effectiveKnowledgeId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ version, updatedBy: user?.id ?? "human", role: nextRole }),
			});
			if (res.ok) {
				const updated = (await res.json().catch(() => ({}))) as { version?: number };
				if (typeof updated.version === "number") setVersion(updated.version);
				setRole(nextRole);
			} else {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setRoleError(data.error ?? `Could not change the role: ${res.status}`);
			}
		} catch {
			setRoleError("Could not change the role: network error");
		} finally {
			setSavingRole(false);
		}
	}

	async function handleArchive(): Promise<void> {
		closeOverflow();
		setArchiving(true);
		setArchiveError(null);
		try {
			const res = await apiFetch(`/api/knowledge/${effectiveKnowledgeId}/archive`, {
				method: "POST",
			});
			if (res.ok) {
				navigate("/knowledge");
			} else {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setArchiveError(data.error ?? `Archive failed: ${res.status}`);
			}
		} catch {
			setArchiveError("Archive failed: network error");
		} finally {
			setArchiving(false);
		}
	}

	/**
	 * AK5: Promote-to-bet handler.
	 * Single-team: POST /api/bets with sourceKnowledgeItemId → navigate to /work/bet/:id.
	 * Multi-team: navigate to /work/bet/new?fromKnowledge=:id (team picker in WorkBetCreate).
	 *
	 * @lore AK5: team resolution uses useTeams() (already used in WorkBetCreate).
	 * Single-team auto-resolves (the common factory case) — zero friction.
	 * Multi-team falls back to the existing WorkBetCreate page which has the team Select
	 * and already collects the required teamId before creating the bet.
	 */
	async function handlePromoteToBet(): Promise<void> {
		closeOverflow();
		const teams = teamsData?.teams ?? [];
		const singleTeam = teams.length === 1;

		if (!singleTeam) {
			// Multi-team: navigate to WorkBetCreate with fromKnowledge param; provenance
			// is carried through by WorkBetCreate's ?fromKnowledge= pre-fill path (task 7).
			navigate(`/work/bet/new?fromKnowledge=${encodeURIComponent(effectiveKnowledgeId)}`);
			return;
		}

		const teamId = teams[0]?.id ?? "";
		if (!teamId) return;

		setPromoteError(null);
		try {
			const res = await apiFetch("/api/bets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					teamId,
					description: savedContent || item.content,
					sourceKnowledgeItemId: effectiveKnowledgeId,
				}),
			});
			if (res.ok) {
				const data = (await res.json()) as { id: string };
				navigate(`/work/bet/${data.id}`);
			} else {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				setPromoteError(data.error ?? `Promote failed: ${res.status}`);
			}
		} catch {
			setPromoteError("Promote failed: network error");
		}
	}

	/**
	 * L18: "Discuss" handler — closes popover and sets thread prefill.
	 * @lore L18: same pattern as WorkBet.handleDiscussBlock — DOM query for excerpt.
	 */
	function handleDiscussBlock(blockId: string): void {
		const blockEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		setThreadPrefill({ blockId, blockExcerpt });
		setOpenBlockId(null);
	}

	/**
	 * T4: "Share" handler — attaches the block as a context ref in the CoC overlay.
	 * @lore T4: Only included as a menu item when overlayOpen=true (reviewer critique).
	 */
	function handleShareBlock(blockId: string): void {
		const blockEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		attachContext({
			kind: "block",
			blockId,
			hostKind: "knowledge_item",
			hostId: item.id,
			label: blockExcerpt,
		});
		setOpenBlockId(null);
	}

	return (
		<PageScaffold
			frame={presentation === "page" ? "page" : "local"}
			data-testid="knowledge-detail-page"
			header={
				/* AI7: PageHeader — h1→h2 via primitive; leading=Breadcrumb; subtitle=metadata bar; actions=Edit/overflow */
				<PageHeader
					presentation={presentation}
					reservePaneControls={presentation === "pane"}
					title={item.title}
					leading={
						/* AG4: DS Breadcrumb replaces local KnowledgeDetailBreadcrumb fn */
						<Breadcrumb
							segments={[
								{ label: "Knowledge", to: "/knowledge" },
								// AV3 AC-3: replace deprecated item.scope with resolved item.scopeName.
								// When scopeName absent (fixture/legacy path), omit the segment entirely.
								// The deprecated KnowledgeScope item.scope is NOT read here (WARNING-A3).
								...(item.scopeName ? [{ label: item.scopeName }] : []),
								...(item.topic ? [{ label: item.topic }] : []),
								{ label: item.title },
							]}
							leading={
								!sidebarMobile ? (
									<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
								) : undefined
							}
							LinkComponent={RRLink}
						/>
					}
					subtitle={
						/* Badge row — metadata bar
					   @lore AD6: kind Tag and layer Tag removed from the metadata bar. */
						<div
							className="flex items-center gap-[6px] flex-wrap"
							data-testid="knowledge-metadata-bar"
						>
							<StatusChip status={knowledgeStatusToStatus(item.status)} />
							<span
								className="type-data  text-[var(--text-tertiary)]  tabular-nums"
								data-testid="knowledge-confidence"
								title="Confidence"
							>
								confidence {formatConfidence(item.confidence)}
							</span>
							{item.originAgent && (
								<span
									className="type-metadata  text-[var(--text-tertiary)]"
									data-testid="knowledge-origin-agent"
								>
									by {item.originAgent}
								</span>
							)}
							<span
								className="type-metadata  text-[var(--text-tertiary)]"
								data-testid="knowledge-updated-at"
							>
								{absoluteDateTime(item.timestamp)}
							</span>
						</div>
					}
					actions={
						<div className="flex items-center gap-[6px]">
							{/* W3 AC-44: save indicator in header (only in edit mode) */}
							{editing && <SaveIndicator saveStatus={saveStatus} />}
							{/* W3 AC-39: Edit/Done button — read-only when agent-authored factory item */}
							{/* AF13 §2: self-authored factory items show Edit; isReadOnly gates this */}
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
							{/* W3 AC-39 / AD6: "..." overflow dropdown — Flag removed, Archive wired. */}
							{!editing && (
								<KnowledgeOverflowMenu
									overflowOpen={overflowOpen}
									onToggle={() => setOverflowOpen((prev) => !prev)}
									onClose={closeOverflow}
									onArchive={() => void handleArchive()}
									onChangeScope={() => {
										setScopeChangeOpen(true);
										closeOverflow();
									}}
									onPromoteToBet={() => void handlePromoteToBet()}
									archiving={archiving}
									itemStatus={item.status}
									isReadOnly={isReadOnly}
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
				{/* Main content column */}
				<div className="flex flex-col gap-[24px] flex-1 min-w-0">
					{amendableBanner && (
						<div
							role="alert"
							className="type-small alert-info flex items-start gap-[9px] px-[12px] py-[9px]  bg-[var(--status-info-dim)] text-[var(--status-info)] rounded-[var(--r-subtle)]"
							data-testid="factory-amendable-banner"
						>
							<span>Amendable under review — edits route through the review queue.</span>
						</div>
					)}

					{/* Role-change error — a failed role save must say so rather than
					    silently snapping the select back. */}
					{roleError !== null && (
						<div
							role="alert"
							className="type-small border-width-thin flex items-center justify-between gap-[9px] px-[12px] py-[9px]  bg-[color-mix(in_oklab,var(--status-error)_8%,transparent)]  border-[var(--border-subtle)] rounded-[var(--r-subtle)]"
							data-testid="role-error"
						>
							<span className="text-[var(--status-error)]">{roleError}</span>
							<button
								type="button"
								className="type-control  text-[var(--text-tertiary)] bg-transparent border-none cursor-pointer"
								onClick={() => setRoleError(null)}
							>
								Dismiss
							</button>
						</div>
					)}

					{/* AD6: Archive error — shown when POST /archive fails */}
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

					{/* AK5: Promote error — shown when POST /api/bets fails during promotion */}
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

					{/* T2: Conflict banner — shown when PATCH returns 409 */}
					{conflictVersion !== null && (
						<div
							role="alert"
							className="type-small border-width-thin flex items-center justify-between gap-[9px] px-[12px] py-[9px] bg-[var(--surface-container)] border-[var(--border-subtle)] rounded-[var(--r-subtle)]"
							data-testid="conflict-banner"
						>
							<span className="text-[var(--text-secondary)]">
								Version conflict — someone else saved this item. Reload to see their changes.
							</span>
							{/* AI5: shared Button primitive (secondary). */}
							<Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
								Reload
							</Button>
						</div>
					)}

					{legacySource && (
						<p className="type-small  text-[var(--text-tertiary)]">{legacySource}</p>
					)}

					{/* L18 + T4: Block actions popover.
						    T4: "Share" action added conditionally when CoC overlay is open. */}
					{openBlockId !== null && (
						<BlockActionsPopover
							id={`block-popover-knowledge-${openBlockId}`}
							open
							onClose={() => setOpenBlockId(null)}
							liveRegionId="block-popover-knowledge-live"
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

					{/* Body: editor or read view */}
					{editing ? (
						<div className="flex flex-col gap-[12px]" data-testid="knowledge-edit-panel">
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
						// @lore AM5 T9: onOpenBlockActions is wired (L18 added this; it opens BlockActionsPopover
						// with Discuss/Share. AM5 adds the block-anchor navigate contract (H2/AC2) as a
						// COMPLEMENT: external links into knowledge now land at #block-<id> via
						// open-handler + resolveHostRoute, while the local popover stays for in-page
						// actions. No change needed here — the two paths are orthogonal.
						<KnowledgeBody
							body={savedContent}
							hostId={item.id}
							documentTitle={item.title}
							onOpenBlockActions={(blockId) => setOpenBlockId(blockId)}
							messagesByBlockId={messagesByBlockId}
						/>
					)}
					{/* L18: Replace ObservationLog with HostThreadSection */}
					<HostThreadSection
						hostKind="knowledge_item"
						hostId={item.id}
						title="Discussion"
						prefill={threadPrefill}
						onClearPrefill={() => setThreadPrefill(undefined)}
						filterBlockId={threadPrefill?.blockId}
					/>
				</div>

				{/* Metadata aside — card containers, no left border */}
				<aside
					data-testid="knowledge-metadata-aside"
					className="w-full md:w-[240px] shrink-0 flex flex-col gap-[18px]"
					aria-label="Knowledge metadata"
				>
					{/* Q2: Scope change dialog */}
					<ScopeChangeDialog
						open={scopeChangeOpen}
						onClose={() => setScopeChangeOpen(false)}
						onSaved={() => setScopeChangeOpen(false)}
						knowledgeId={effectiveKnowledgeId}
						currentVersion={item.versionNum ?? 1}
						currentScopeKind={item.scopeKind ?? "factory"}
					/>

					{/* Metadata card */}
					<div className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px]">
						<SectionLabel label="Metadata" as="h2" />
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Kind</span>
							{/* AF13 §5: null/undefined kind renders "—" not blank or "undefined" */}
							<span className="type-small text-[var(--text-primary)] ">{item.kind ?? "—"}</span>
						</div>
						{/* Role row — what context assembly does with this document. Unlike
						    scope, which carries a reason and gets a dialog, a role change is an
						    ordinary field edit and saves immediately. */}
						<div
							className="type-small border-width-thin-b flex justify-between items-center py-[6px]  border-[var(--border-subtle)] "
							data-testid="knowledge-role-row"
						>
							<span className="text-[var(--text-tertiary)]">Role</span>
							{/* W3 AC-46: the metadata aside is read-only while the body is being
							    edited — the role reads as text until editing ends. */}
							{isReadOnly || editing ? (
								<span className="type-small text-[var(--text-primary)] ">
									{KNOWLEDGE_ROLE_LABEL[role]}
								</span>
							) : (
								<Select
									size="sm"
									aria-label="Role"
									data-testid="knowledge-role-select"
									value={role}
									disabled={savingRole}
									options={KNOWLEDGE_ROLES.map((r) => ({
										value: r,
										label: KNOWLEDGE_ROLE_LABEL[r],
									}))}
									onChange={(e) => void handleRoleChange(e.target.value as KnowledgeRole)}
								/>
							)}
						</div>
						{/* AV3: Scope row — resolved scope name + Change/ReadOnly affordance */}
						<div
							className="type-small border-width-thin-b flex justify-between items-center py-[6px]  border-[var(--border-subtle)] "
							data-testid="knowledge-scope-row"
						>
							<span className="text-[var(--text-tertiary)]">Scope</span>
							<span className="flex items-center gap-[6px]">
								<span className="type-small text-[var(--text-primary)] ">
									{/* AV3: resolved name takes priority; bucket fallback only when absent */}
									{item.scopeName ?? scopeKindToLabel(item.scopeKind ?? "factory")}
								</span>
								{/* AV3 AC-4: inline Change trigger (editable) or Read-only marker (read-only) */}
								{!isReadOnly ? (
									<Button
										variant="ghost"
										size="sm"
										data-testid="knowledge-scope-change-trigger"
										onClick={() => setScopeChangeOpen(true)}
									>
										Change
									</Button>
								) : (
									<span
										className="type-metadata  text-[var(--text-tertiary)]"
										data-testid="knowledge-scope-readonly"
									>
										Read-only
									</span>
								)}
							</span>
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Status</span>
							<StatusChip status={knowledgeStatusToStatus(item.status)} />
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Confidence</span>
							<span className="type-data text-[var(--text-primary)]   tabular-nums">
								{formatConfidence(item.confidence)}
							</span>
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Last edited</span>
							<span className="type-small text-[var(--text-primary)] ">
								{absoluteDateTime(item.timestamp)}
							</span>
						</div>
						<div className="border-width-thin-b type-small flex justify-between items-center py-[6px]  border-[var(--border-subtle)] ">
							<span className="text-[var(--text-tertiary)]">Editor</span>
							{/* Resolve updatedBy to display name:
							    - If it matches the current user's id, show their name.
							    - If it's a UUID with no name mapping, show truncated monospace.
							    - Fallback: "Unknown". */}
							{item.updatedBy && item.updatedBy === user?.id ? (
								<span className="type-small text-[var(--text-primary)] ">{user.name}</span>
							) : item.updatedBy && item.updatedBy !== "Unknown" ? (
								<span className="type-small text-[var(--text-primary)] ">Another editor</span>
							) : (
								<span className="type-small text-[var(--text-primary)] ">
									{item.updatedBy ?? "Unknown"}
								</span>
							)}
						</div>
					</div>

					{/* W3 AC-41: backlinks card */}
					<BacklinksCard
						structuredRelatedItems={item.structuredRelatedItems}
						relatedItems={related}
					/>
				</aside>
			</div>
		</PageScaffold>
	);
}
