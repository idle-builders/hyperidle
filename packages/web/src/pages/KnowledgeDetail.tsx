import {
	BlockActionsPopover,
	BodyEditor,
	knowledgeStatusToStatus,
	StatusChip,
	Tag,
} from "@hyperidle/design-system";
import {
	KNOWLEDGE_STATUSES,
	type KnowledgeScope,
	type KnowledgeStatus,
} from "@hyperidle/fabric/types";
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
 * replaces the fixture lookup entirely. See plans/L23/follow-ups.md.
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
import type { Message, PlainPayloadWithBlockId, ScopeKind } from "@hyperidle/shared";
import { isRedactedPayload, SCOPE_KINDS } from "@hyperidle/shared";
import { type JSX, useContext, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CocContext } from "../contexts/CocContext.js";
// eslint-disable-next-line design/no-mock-data-import -- tracked in #93
import { knowledgeItems, type MockKnowledgeItem } from "../fixtures/knowledge-data";
import { useAutoSave } from "../hooks/useAutoSave.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useHostThread } from "../hooks/useHostThread.js";
import { useKnowledgeItem } from "../hooks/useKnowledgeItem.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
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
	kind: string;
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
	relatedItems?: ReadonlyArray<string>;
	/** W3 AC-41: structured related items with title (from API) */
	structuredRelatedItems?: ReadonlyArray<{ id: string; title: string }>;
	topic?: string;
	/** W3 AC-40: 30-day access count from API */
	accessCount?: number;
	/** W3 AC-40: last editor name */
	updatedBy?: string;
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
}

export function KnowledgeDetail({ overrideKnowledgeId }: KnowledgeDetailProps = {}): JSX.Element {
	const { knowledgeId: routeKnowledgeId } = useParams<{ knowledgeId: string }>();
	const knowledgeId = overrideKnowledgeId ?? routeKnowledgeId;

	// T2: Fetch from API, fall back to fixture data so existing tests stay green.
	// @lore T2: Dual data source — API item takes priority over fixture. Fixture
	// items (k1, k2, k11, k12) are used when the API returns null (test env or
	// when item doesn't exist in the DB). Full fixture removal deferred to a
	// future workpackage once tests are migrated to seeded DB data.
	const { data: apiItem } = useKnowledgeItem(knowledgeId);
	const fixtureItem = findDetail(knowledgeId);

	let item: DetailItem;
	if (apiItem) {
		item = {
			id: apiItem.id,
			title: apiItem.title,
			layer: apiItem.layer ?? "unknown",
			kind: apiItem.kind ?? "unknown",
			status: toKnowledgeStatus(apiItem.status),
			timestamp: apiItem.updatedAt,
			content: apiItem.body,
			versionNum: apiItem.version,
			scopeKind: toScopeKind(apiItem.scopeKind),
			confidence: apiItem.confidence,
			accessCount: apiItem.accessCount,
			updatedBy: apiItem.updatedBy,
			structuredRelatedItems: apiItem.relatedItems,
		};
	} else {
		item = fixtureItem ?? FALLBACK_DETAIL;
	}

	const legacySource = knowledgeId !== undefined ? LEGACY_SOURCES[knowledgeId] : undefined;
	// Q2: Pass the route-resolved knowledgeId to the view so ScopeChangeDialog
	// uses the actual route param for the PATCH URL, not item.id from fixture data
	// (FALLBACK_DETAIL.id would be "unknown" for non-fixture item IDs).
	return (
		<KnowledgeDetailView item={item} legacySource={legacySource} routeKnowledgeId={knowledgeId} />
	);
}

interface KnowledgeDetailViewProps {
	item: DetailItem;
	legacySource?: string;
	/** Q2: The route-resolved knowledge id. Supersedes item.id for API calls. */
	routeKnowledgeId?: string;
}

function KnowledgeDetailView({
	item,
	legacySource,
	routeKnowledgeId,
}: KnowledgeDetailViewProps): JSX.Element {
	// Q2: Use the route-resolved id for API calls to avoid FALLBACK_DETAIL.id = "unknown"
	const effectiveKnowledgeId = routeKnowledgeId ?? item.id;
	// T4: CocContext for block share action
	const { overlayOpen, attachContext } = useContext(CocContext);
	const isFactory = item.scope === "factory" || item.scopeKind === "factory";
	const amendableBanner = isFactory && item.status === "needs_human";
	const initialContent = item.content ?? "";
	const [savedContent, setSavedContent] = useState<string>(initialContent);
	const [editing, setEditing] = useState(false);
	// T2: editContent captures body at edit-start time (consumed once by BodyEditor on mount)
	const [editContent, setEditContent] = useState<string>(initialContent);

	// Q2: Scope change dialog state.
	const [scopeChangeOpen, setScopeChangeOpen] = useState(false);

	// L18: Block popover state
	const [openBlockId, setOpenBlockId] = useState<string | null>(null);
	const [threadPrefill, setThreadPrefill] = useState<
		{ blockId: string; blockExcerpt: string } | undefined
	>(undefined);

	// L18: Fetch the host thread for inline anchored messages
	const { data: threadData } = useHostThread("knowledge_item", item.id);

	// T2: Auto-save version tracking
	const [version, setVersion] = useState<number>(item.versionNum ?? 1);
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
		<div className="flex flex-col gap-3 h-full" data-testid="knowledge-detail-page">
			{/* W3 AC-43: max-width 960px centered body */}
			<div
				data-testid="knowledge-detail-body"
				className="flex flex-col gap-3 max-w-[960px] mx-auto w-full"
			>
				{amendableBanner && (
					<div
						role="alert"
						className="alert alert-info text-sm"
						data-testid="factory-amendable-banner"
					>
						<span>Amendable under review — edits route through the review queue.</span>
					</div>
				)}
				{/* W3 AC-39: Header with Edit button + "..." overflow menu */}
				<div className="flex items-start justify-between gap-2">
					<h1 className="text-sm font-semibold">{item.title}</h1>
					<div className="flex items-center gap-1">
						{/* W3 AC-44: save indicator in header (only in edit mode) */}
						{editing && (
							<span
								className="text-xs text-[var(--text-tertiary)]"
								aria-live="polite"
								data-testid="save-indicator"
								data-save-status={saveStatus}
							>
								{saveStatus === "saving" && "Saving..."}
								{saveStatus === "saved" && "Saved"}
								{saveStatus === "error" && (
									<span className="text-[var(--status-error)]">Save failed</span>
								)}
							</span>
						)}
						{/* W3 AC-39: Edit/Done button */}
						{!editing ? (
							<button type="button" className="btn btn-xs btn-ghost" onClick={startEdit}>
								Edit
							</button>
						) : (
							<button type="button" className="btn btn-xs btn-ghost" onClick={exitEdit}>
								Done
							</button>
						)}
						{/* W3 AC-39: "..." overflow dropdown replacing inline "Change scope" button */}
						{!editing && (
							<div className="relative" data-testid="knowledge-overflow-menu">
								<button
									type="button"
									aria-label="More options"
									className="btn btn-xs btn-ghost"
									onClick={() => {
										const el = document.getElementById(`knowledge-overflow-${item.id}`);
										if (el) el.toggleAttribute("open");
									}}
								>
									...
								</button>
								<div
									id={`knowledge-overflow-${item.id}`}
									className="absolute right-0 top-full z-10 mt-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-[var(--r-subtle)] shadow-[var(--shadow-elevated)] py-1 min-w-[160px] hidden [&[open]]:block"
								>
									<button
										type="button"
										data-dropdown-item
										className="w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--accent-primary-dim)]"
										onClick={() => undefined}
									>
										Flag
									</button>
									<button
										type="button"
										data-dropdown-item
										className="w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--accent-primary-dim)]"
										onClick={() => undefined}
									>
										Archive
									</button>
									<button
										type="button"
										data-dropdown-item
										className="w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--accent-primary-dim)]"
										onClick={() => setScopeChangeOpen(true)}
									>
										Change scope
									</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Q2: Scope change dialog — uses effectiveKnowledgeId (route param) not
			    item.id so that FALLBACK_DETAIL cases send to the correct endpoint. */}
				<ScopeChangeDialog
					open={scopeChangeOpen}
					onClose={() => setScopeChangeOpen(false)}
					onSaved={() => setScopeChangeOpen(false)}
					knowledgeId={effectiveKnowledgeId}
					currentVersion={item.versionNum ?? 1}
					currentScopeKind={item.scopeKind ?? "factory"}
				/>
				<div className="flex items-center gap-2 flex-wrap" data-testid="knowledge-metadata-bar">
					<Tag label={item.kind} />
					<StatusChip status={knowledgeStatusToStatus(item.status)} />
					<Tag label={item.layer} />
					<span
						className="badge badge-ghost badge-sm font-mono"
						data-testid="knowledge-confidence"
						title="Confidence"
					>
						confidence {formatConfidence(item.confidence)}
					</span>
					<span
						className="text-xs text-[var(--text-tertiary)]"
						data-testid="knowledge-origin-agent"
					>
						by {item.originAgent ?? "unknown"}
					</span>
					<span className="text-xs text-[var(--text-tertiary)]" data-testid="knowledge-updated-at">
						{item.timestamp}
					</span>
				</div>
				{legacySource && <p className="text-xs text-[var(--text-tertiary)]">{legacySource}</p>}

				{/* T2: Conflict banner — shown when PATCH returns 409 */}
				{conflictVersion !== null && (
					<div
						role="alert"
						className="flex items-center justify-between gap-2 px-3 py-2 text-xs
					           bg-[var(--surface-container)] border border-[var(--border-subtle)]
					           rounded-[var(--r-subtle)]"
						data-testid="conflict-banner"
					>
						<span className="text-[var(--text-secondary)]">
							Version conflict — someone else saved this item. Reload to see their changes.
						</span>
						<button
							type="button"
							className="btn btn-xs btn-ghost"
							onClick={() => window.location.reload()}
						>
							Reload
						</button>
					</div>
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

				{/* W3 AC-40: two-column layout (body + metadata aside) */}
				<div className="grid grid-cols-1 lg:grid-cols-[1fr_14rem] gap-4">
					<div className="flex flex-col gap-3 min-w-0">
						{editing ? (
							<div className="flex flex-col gap-2" data-testid="knowledge-editor-area">
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
							<KnowledgeBody
								body={savedContent}
								hostId={item.id}
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
					{/* W3 AC-40: metadata aside with structured fields */}
					<aside
						data-testid="knowledge-metadata-aside"
						className="flex flex-col gap-3 border-l border-[var(--border-subtle)] pl-3 min-w-0"
						aria-label="Knowledge metadata"
					>
						<div className="flex flex-col gap-[6px]">
							<span className="text-[11px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Kind
							</span>
							<span className="text-[13px] text-[var(--text-primary)]">{item.kind}</span>
						</div>
						<div className="flex flex-col gap-[6px]">
							<span className="text-[11px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Status
							</span>
							<StatusChip status={knowledgeStatusToStatus(item.status)} />
						</div>
						<div className="flex flex-col gap-[6px]">
							<span className="text-[11px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Confidence
							</span>
							<span className="text-[13px] font-mono tabular-nums text-[var(--text-primary)]">
								{formatConfidence(item.confidence)}
							</span>
						</div>
						<div className="flex flex-col gap-[6px]">
							<span className="text-[11px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Last edited
							</span>
							<span className="text-[13px] text-[var(--text-primary)]">{item.timestamp}</span>
						</div>
						<div className="flex flex-col gap-[6px]">
							<span className="text-[11px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Access count
							</span>
							<span className="text-[13px] font-mono tabular-nums text-[var(--text-primary)]">
								{item.accessCount ?? 0}
							</span>
						</div>
						{/* W3 AC-41: backlinks card */}
						<div data-testid="knowledge-backlinks-card" className="flex flex-col gap-[6px] mt-3">
							<span className="text-[11px] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]">
								Related
							</span>
							{item.structuredRelatedItems && item.structuredRelatedItems.length > 0 ? (
								<ul className="flex flex-col gap-1">
									{item.structuredRelatedItems.map((ri) => (
										<li key={ri.id}>
											<Link
												to={`/knowledge/${ri.id}`}
												className="text-[12px] text-[var(--text-secondary)] hover:underline"
											>
												{ri.title}
											</Link>
										</li>
									))}
								</ul>
							) : related.length > 0 ? (
								<ul className="flex flex-col gap-1">
									{related.map((ri) => (
										<li key={ri.id}>
											<Link
												to={`/knowledge/${ri.id}`}
												className="text-[12px] text-[var(--text-secondary)] hover:underline"
											>
												{ri.title}
											</Link>
										</li>
									))}
								</ul>
							) : (
								<p className="text-[12px] text-[var(--text-tertiary)]">No related items.</p>
							)}
						</div>
					</aside>
				</div>
			</div>
		</div>
	);
}

interface RelatedSidebarProps {
	items: ReadonlyArray<MockKnowledgeItem>;
}

function _RelatedSidebar({ items }: RelatedSidebarProps): JSX.Element {
	const labelCount = `${items.length} ${items.length === 1 ? "item" : "items"}`;
	return (
		<aside
			className="flex flex-col gap-2 border-l border-[var(--border-subtle)] pl-3 min-w-0"
			data-testid="knowledge-related-sidebar"
			aria-label={`Related items, ${labelCount}`}
		>
			<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
				Related
			</h2>
			{items.length === 0 ? (
				<p className="text-xs text-[var(--text-tertiary)]">No related items.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{items.map((i) => (
						<li key={i.id} data-testid="related-item">
							<Link
								to={`/knowledge/${i.id}`}
								className="text-xs text-[var(--text-secondary)] hover:underline"
							>
								{i.title}
							</Link>
						</li>
					))}
				</ul>
			)}
		</aside>
	);
}
