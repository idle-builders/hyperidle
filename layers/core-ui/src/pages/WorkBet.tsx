/**
 * Work/Bet page — bet detail view composed from Tier 2 components (BetCard, TaskCard)
 * and DaisyUI primitives. Shows bet details + task list for that bet.
 *
 * @lore L16: bet pitch renders via L2 Block primitive (deriveBlocks → <Block />).
 * On-disk format is markdown; blocks are derived at render time.
 *
 * @lore L18: Block popover wiring uses document.querySelector to capture the
 * gutter anchor at the moment onOpenActions fires (Block does NOT forwardRef).
 * Pattern: `document.querySelector('[data-block-id="${blockId}"] [data-block-gutter]')`.
 * The anchor is stored in state alongside openBlockId.
 *
 * @lore L18: WorkBet calls useHostThread directly to derive messagesByBlockId
 * for the inline anchored-message slots. HostThreadSection also calls it for
 * the chronological thread view — two fetches, same data. Acceptable for v1;
 * a shared fetch surface requires a global cache layer (out of scope).
 */

import { deriveBlocks } from "@hyperidle/block-derivation";
import type { MenuItem } from "@hyperidle/design-system";
import {
	Avatar,
	Block,
	BlockActionsPopover,
	BodyEditor,
	Breadcrumb,
	Button,
	betOutcomeVerdictToStatus,
	betStatusToStatus,
	Dialog,
	EmptyState,
	ErrorState,
	Input,
	KpiStat,
	LiveDot,
	Menu,
	PageHeader,
	PageScaffold,
	SectionLabel,
	Select,
	SkeletonCard,
	SkeletonList,
	StatusChip,
	taskOutcomeVerdictToStatus,
	taskStateToStatus,
} from "@hyperidle/design-system";
import type {
	BetOutcomeVerdict,
	BetStatus,
	Message,
	SessionOutcome,
} from "@hyperidle/domain-model";
import {
	BET_OUTCOME_VERDICT_LABEL,
	BET_OUTCOME_VERDICTS,
	BET_STATUS_LABEL,
	isRedactedPayload,
	TASK_OUTCOME_VERDICT_LABEL,
	TASK_STATE_LABEL,
} from "@hyperidle/domain-model";
import { relativeLong } from "@hyperidle/presentation-format";
import { type JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link as RRLink, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { ArtifactThreadsSummary } from "../components/ArtifactThreadsSummary.js";
import { AssistantAttachButton } from "../components/AssistantAttachButton";
import { AssistantContext } from "../contexts/AssistantContext.js";
import { useLatestRunOutcomes } from "../hooks/useAgentRunState.js";
import { useBet } from "../hooks/useBet";
import { useBetDescriptionSave } from "../hooks/useBetDescriptionSave.js";
import { useHostThread } from "../hooks/useHostThread.js";
import { useViewportBreakpoint } from "../hooks/useViewportBreakpoint.js";
import { apiFetch } from "../services/api-fetch.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { NavHistoryCluster } from "../shell/NavHistoryCluster.js";
import type { BetDetail } from "../types/bet";
import { blockExcerptFromPayload } from "../utils/block-excerpt.js";
import { deriveInitials } from "../utils/initials.js";
import { KnowledgeCreateDialog } from "./knowledge/KnowledgeCreateDialog";

// L19: "outcome" column added for latest session outcome sort.
type SortColumn = "title" | "status" | "owner" | "outcome";
type SortDirection = "asc" | "desc";

// AI4: TASK_VERDICT_LABEL, BET_VERDICT_LABEL, TASK_STATE_LABEL, taskStateBadgeClass
// deleted — now sourced from @hyperidle/domain-model (TASK_OUTCOME_VERDICT_LABEL,
// BET_OUTCOME_VERDICT_LABEL, TASK_STATE_LABEL) and @hyperidle/design-system (StatusChip).

/**
 * T3: Bet statuses where the description is mutable (editable via BodyEditor).
 * Immutable statuses (completed, killed) render the read-only BetPitch (block view).
 *
 * @lore T3: Mirrors server-side DESCRIPTION_MUTABLE_IN_STATUSES in bets.ts.
 * The frontend check is defense-in-depth; the server enforces the constraint too.
 */
const BET_DESCRIPTION_MUTABLE_STATUSES = new Set<BetStatus>(["draft", "active"]);

/**
 * Narrow the run outcome `agent-orchestration` returns onto the wire enum the
 * outcome chip renders (AU26 J4).
 */
const SESSION_OUTCOMES: ReadonlySet<string> = new Set([
	"completed",
	"crashed",
	"stopped",
	"not_returned",
]);
function toSessionOutcome(value: string | null): SessionOutcome | null {
	return value !== null && SESSION_OUTCOMES.has(value) ? (value as SessionOutcome) : null;
}

function sortTasks(
	tasks: BetDetail["tasks"],
	column: SortColumn | null,
	direction: SortDirection,
): BetDetail["tasks"] {
	if (column === null) return tasks;
	const copy = [...tasks];
	copy.sort((a, b) => {
		let av: string | number = "";
		let bv: string | number = "";
		if (column === "outcome") {
			// L19: outcome column sorts by the outcome string value
			av = a.latestSessionOutcome ?? "";
			bv = b.latestSessionOutcome ?? "";
		} else {
			av = (a[column as keyof typeof a] as string | undefined) ?? "";
			bv = (b[column as keyof typeof b] as string | undefined) ?? "";
		}
		if (av < bv) return direction === "asc" ? -1 : 1;
		if (av > bv) return direction === "asc" ? 1 : -1;
		return 0;
	});
	return copy;
}

/**
 * AnchoredMessages — tiny inline component that renders block-anchored messages
 * below a block's payload. Shown in addition to the chronological thread log.
 *
 * @lore L18: anchoring is additive — messages render both here (inline) AND in
 * the chronological thread. No interaction from here; the thread log is the
 * authoritative interaction surface.
 */
interface AnchoredMessagesProps {
	messages: ReadonlyArray<Message>;
	/**
	 * T5: When true, renders an "anchor lost" indicator above the messages.
	 * Used for orphaned messages whose block no longer exists in the pitch.
	 * @lore T5: same pattern as KnowledgeBody.tsx AnchoredMessages.
	 */
	anchorLost?: boolean;
}

function AnchoredMessages({
	messages,
	anchorLost = false,
}: AnchoredMessagesProps): JSX.Element | null {
	if (messages.length === 0) return null;
	return (
		<div data-testid="anchored-messages" className="flex flex-col gap-[3px] mt-[3px]">
			{anchorLost && (
				<span
					data-testid="anchor-lost-indicator"
					className="type-metadata  text-[var(--text-tertiary)] italic"
				>
					anchor lost
				</span>
			)}
			{messages.map((msg) => {
				if (msg.type !== "plain") return null;
				const text = isRedactedPayload(msg.payload) ? "[redacted]" : msg.payload.text;
				return (
					<div
						key={msg.id}
						className="type-metadata  text-[var(--text-tertiary)] px-2 py-1 bg-[var(--surface-container)] rounded-[var(--r-subtle)]"
					>
						{text}
					</div>
				);
			})}
		</div>
	);
}

/**
 * BetPitch — co-located adapter: deriveBlocks → <Block />.
 *
 * @lore L16: BetPitch is co-located, not a Tier-2 design-system component.
 * It is a single-call-site adapter and would not earn its keep as a shared
 * component.
 *
 * @lore L18: BetPitch now accepts onDiscussBlock and messagesByBlockId to
 * wire the L2 block popover and inline anchored messages.
 */
interface BetPitchProps {
	description: string;
	betId: string;
	documentTitle: string;
	/** Called when the user opens a block's actions menu (Space/Enter on block). Sets openBlockId. */
	onOpenBlockActions?: (blockId: string) => void;
	messagesByBlockId?: ReadonlyMap<string, ReadonlyArray<Message>>;
	/** T4: Called when the user clicks "Share" on a block. Attaches as context ref in CoC. */
	onShareBlock?: (blockId: string) => void;
}

function BetPitch({
	description,
	betId,
	documentTitle,
	onOpenBlockActions,
	messagesByBlockId,
	onShareBlock: _onShareBlock,
}: BetPitchProps): JSX.Element | null {
	const { blocks } = useMemo(
		() => deriveBlocks(description, { kind: "bet", id: betId }),
		[description, betId],
	);

	// Collect all messages that have a blockId — including those whose blockId
	// doesn't match any rendered block (e.g. from a previous revision of the pitch).
	// Render them in a catch-all container so they're never silently dropped.
	// @lore L18: messagesByBlockId keys may not match current block IDs if the
	// pitch content changed after the message was posted. We show all anchored
	// messages regardless to avoid data loss UX.
	const allAnchoredMessages = useMemo((): ReadonlyArray<Message> => {
		if (!messagesByBlockId) return [];
		// Widen to Set<string> so string keys from messagesByBlockId compare
		// without brand mismatch (BlockId is string & {__brand}).
		const renderedBlockIds = new Set<string>(blocks.map((b) => b.id));
		const unmatched: Message[] = [];
		for (const [blockId, msgs] of messagesByBlockId) {
			if (!renderedBlockIds.has(blockId)) {
				unmatched.push(...msgs);
			}
		}
		return unmatched;
	}, [messagesByBlockId, blocks]);

	if (blocks.length === 0) return null;
	return (
		<section aria-label="Bet pitch" data-testid="bet-pitch">
			{blocks.map((b, blockIndex) => (
				// T4: relative wrapper so AssistantAttachButton can be absolutely positioned in the gutter.
				<div key={b.id} className="relative group/block-attach">
					<Block
						id={b.id}
						payload={b.payload}
						outline={{ documentTitle, blockIndex, levelOffset: 1 }}
						onOpenActions={
							onOpenBlockActions !== undefined ? () => onOpenBlockActions(b.id) : undefined
						}
						slots={{
							inlineAfterPayload: messagesByBlockId ? (
								<AnchoredMessages messages={messagesByBlockId.get(b.id) ?? []} />
							) : undefined,
						}}
					/>
					{/* T4: AssistantAttachButton — shows when overlay is open, attaches block ref */}
					<AssistantAttachButton
						ref={{
							kind: "block",
							blockId: b.id,
							hostKind: "bet",
							hostId: betId,
							label: blockExcerptFromPayload(b.payload),
						}}
					/>
				</div>
			))}
			{/* Fallback: anchored messages whose block no longer exists in the pitch */}
			{/* T5: anchorLost={true} renders the honest indicator for orphaned messages */}
			<AnchoredMessages messages={allAnchoredMessages} anchorLost />
		</section>
	);
}

/**
 * L14: The set of actions the founder can take on a bet from the action bar.
 * AD5 AC-5: pause, resume, activate removed — no pause state in bet status enum.
 */
type BetActionKind = "kill" | "unblock" | "activate";

/**
 * ConsequencePreviewDialog — confirmation dialog for the Kill bet action.
 *
 * @lore AI2: Migrated from native <dialog> + showModal() cancel-event block to
 * Dialog primitive with isDirty=false (confirmation-never-dirty rule, §1.1).
 * Under this rule Escape closes the dialog immediately — the old Esc-block via
 * `cancel` event preventDefault is REMOVED. The user must provide a reason to
 * confirm; the dialog does NOT block Escape. (SANCTIONED CHANGE #1).
 *
 * @lore L14: The reason field is required to activate the "Kill bet" confirm
 * button. Empty reason → disabled button. This rule is unchanged.
 */
interface ConsequencePreviewDialogProps {
	open: boolean;
	onConfirm: (reason: string) => Promise<void>;
	onCancel: () => void;
}

function ConsequencePreviewDialog({
	open,
	onConfirm,
	onCancel,
}: ConsequencePreviewDialogProps): JSX.Element | null {
	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setReason("");
			setError(null);
			setSubmitting(false);
		}
	}, [open]);

	const handleConfirm = async (): Promise<void> => {
		const trimmed = reason.trim();
		if (!trimmed) return;
		setSubmitting(true);
		setError(null);
		try {
			await onConfirm(trimmed);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Action failed. Please try again.");
			setSubmitting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onClose={onCancel}
			title="Kill this bet?"
			isDirty={false}
			size="sm"
			footer={
				<>
					<Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => void handleConfirm()}
						disabled={!reason.trim() || submitting}
					>
						{submitting ? "…" : "Kill bet"}
					</Button>
				</>
			}
		>
			{/* AF12: honest cascade copy. The SAVED line drops "immediately" (capacity
			    is not freed the instant Kill is clicked) and the NOTE qualifier states
			    that running agents finish their current step before halting. */}
			<div className="type-metadata  text-[var(--text-tertiary)] space-y-[3px] mb-3">
				<p>
					<span className="type-small  text-error">STOPS:</span> In-progress tasks are killed and
					their sessions are stopped.
				</p>
				<p>
					<span className="type-small  text-[var(--text-primary)]">CONTINUES:</span> Existing
					artifacts are preserved.
				</p>
				<p>
					<span className="type-small  text-[var(--text-primary)]">SAVED:</span> Team capacity is
					freed.
				</p>
				<p>
					<span className="type-small  text-[var(--text-primary)]">NOTE:</span> Running agents
					finish their current step before they halt.
				</p>
			</div>

			<Input
				textarea
				label="Reason (required)"
				placeholder="Why is this bet being killed?"
				value={reason}
				onChange={(e) => setReason(e.target.value)}
				disabled={submitting}
				maxLength={500}
			/>

			{error && (
				<p role="alert" className="type-metadata  text-error mt-[6px]">
					{error}
				</p>
			)}
		</Dialog>
	);
}

export interface WorkBetProps {
	/**
	 * J8: opt-in loading state. When true the page renders a card + list
	 * skeleton matching the eventual shape. Default false keeps production
	 * behavior unchanged.
	 */
	loading?: boolean;
	/**
	 * L16: override the bet with a directly injected BetDetail. When set,
	 * the useBet hook is not called and the API fetch is skipped. Used by
	 * stories and tests to inject fixture data without importing from __fixtures__/.
	 */
	overrideBet?: BetDetail;
}

// @lore M3 A12: FOUNDER_ID constant deleted. The founder id is now read from
// useCurrentUser() so the correct authenticated user is always used.

export function WorkBet({ loading = false, overrideBet }: WorkBetProps = {}): JSX.Element {
	const { betId: routeBetId } = useParams<{ betId: string }>();
	const navigate = useNavigate();
	const { sidebarMobile } = useViewportBreakpoint();
	const onOpenArtifact = useArtifactOpen();
	// T4: AssistantContext for block share action
	const { overlayOpen, attachContext } = useContext(AssistantContext);

	// Only call useBet when there is no override. When overrideBet is provided,
	// pass undefined so the hook short-circuits to { data: null, loading: false, error: null }.
	const fetched = useBet(overrideBet ? undefined : routeBetId);

	const bet = overrideBet ?? fetched.data;

	const [sortColumn] = useState<SortColumn | null>(null);
	const [sortDirection] = useState<SortDirection>("asc");

	// AC1: Bet outcome section state — 'view' | 'editing'
	const [outcomeEditMode, setOutcomeEditMode] = useState<"view" | "editing">("view");
	const [outcomeVerdictForm, setOutcomeVerdictForm] = useState<BetOutcomeVerdict | "">(
		bet?.outcomeVerdict ?? "",
	);
	const [outcomeSummaryForm, setOutcomeSummaryForm] = useState<string>(bet?.outcomeSummary ?? "");
	const [outcomeSaving, setOutcomeSaving] = useState(false);
	const [outcomeError, setOutcomeError] = useState<string | null>(null);
	// AC2: Learnings field and AI draft state for the retro flow
	const [retroLearningsForm, setRetroLearningsForm] = useState<string>("");
	const [retroDrafting, setRetroDrafting] = useState(false);
	const [retroDraftError, setRetroDraftError] = useState<string | null>(null);

	// L18: Block popover state — openBlockId is set when the user opens a block's
	// actions menu; null when the popover is closed.
	const [openBlockId, setOpenBlockId] = useState<string | null>(null);

	// L18: Thread prefill state — set when the user selects "Discuss" on a block.
	// Passed to HostThreadSection as the `prefill` prop.
	const [threadPrefill, setThreadPrefill] = useState<
		{ blockId: string; blockExcerpt: string } | undefined
	>(undefined);

	// L14: Action dialog state.
	const [consequenceDialog, setConsequenceDialog] = useState<{
		open: boolean;
	}>({ open: false });
	// AF12: activate-bet error surface (shown under the bet title on failure).
	const [activateError, setActivateError] = useState<string | null>(null);
	// AG5: Bet overflow menu open state (replaces toggleAttribute("open") DOM hack — C5).
	const [betOverflowOpen, setBetOverflowOpen] = useState(false);

	// Q2: Add knowledge dialog state.
	const [addKnowledgeOpen, setAddKnowledgeOpen] = useState(false);

	// T3: Status-based description editability.
	// @lore T3: canEditDescription derives from bet.status. BodyEditor is always
	// mounted for draft/active bets (no Edit/Done toggle). Block actions are only
	// available in immutable statuses (completed/killed) via BetPitch.
	const canEditDescription = bet ? BET_DESCRIPTION_MUTABLE_STATUSES.has(bet.status) : false;
	const [descriptionEditing, setDescriptionEditing] = useState(false);

	// T3: Track the initial description content for dirty-check in handleDescriptionChange.
	// useRef so it doesn't cause re-renders and survives across the debounce.
	const initialDescriptionRef = useRef<string>(bet?.description ?? "");

	// T3: Auto-save hook for bet description.
	const { status: saveStatus, save: triggerSave } = useBetDescriptionSave({
		betId: bet?.id ?? "",
		onSaved: () => fetched.refresh?.(),
	});

	const handleDescriptionChange = useCallback(
		(markdown: string): void => {
			// T3 dirty check (T2 F3 pattern): skip save when content matches initial
			if (markdown === initialDescriptionRef.current) return;
			triggerSave(markdown);
		},
		[triggerSave],
	);

	// L18: Fetch the host thread directly to derive messagesByBlockId for the
	// inline anchored-message slots. HostThreadSection uses its own fetch for
	// the chronological view.
	const hostThreadId = bet?.id;
	const { data: threadData, refresh: refreshThreadData } = useHostThread("bet", hostThreadId ?? "");

	// L18: Derive messagesByBlockId from the thread messages.
	const messagesByBlockId = useMemo((): ReadonlyMap<string, ReadonlyArray<Message>> => {
		const map = new Map<string, Message[]>();
		if (!threadData?.messages) return map;
		for (const msg of threadData.messages) {
			if (msg.type !== "plain") continue;
			if (isRedactedPayload(msg.payload)) continue;
			const blockId = (msg.payload as { blockId?: string }).blockId;
			if (!blockId) continue;
			const existing = map.get(blockId) ?? [];
			map.set(blockId, [...existing, msg]);
		}
		return map;
	}, [threadData?.messages]);

	// @lore AU26 J4: `latestSessionOutcome` used to arrive on each task in
	// `GET /api/bets/:id` — core-api reading `agent-orchestration`'s `sessions`
	// table to decorate a task row. Founder ruling: *"orchestration now has an api
	// so that the ui can get the agent run state from the orchestration directly
	// and combine this information in the ui instead of in the core api
	// service."* The outcome chip on the task sheet and the outcome sort column
	// read it from here now; the merge below keeps the task objects the exact
	// shape both renders already expect.
	const betTaskIds = useMemo(() => (bet?.tasks ?? []).map((t) => t.id), [bet?.tasks]);
	const latestOutcomes = useLatestRunOutcomes(betTaskIds);
	const tasksWithOutcome = useMemo(
		() =>
			(bet?.tasks ?? []).map((task) => ({
				...task,
				latestSessionOutcome: toSessionOutcome(latestOutcomes[task.id] ?? null),
			})),
		[bet?.tasks, latestOutcomes],
	);

	const sortedTasks = useMemo(
		() => sortTasks(tasksWithOutcome, sortColumn, sortDirection),
		[tasksWithOutcome, sortColumn, sortDirection],
	);

	// AF12: activate a draft bet via POST /commit. On failure, surface a
	// role="alert" line under the bet title (capacity-at-limit returns a clean 400).
	const handleActivate = useCallback(async (): Promise<void> => {
		if (!bet) return;
		setActivateError(null);
		try {
			const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/commit`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? "Couldn't activate.");
			}
			fetched.refresh();
		} catch (err) {
			setActivateError(err instanceof Error ? err.message : "Couldn't activate.");
		}
	}, [bet, fetched]);

	// L14: Action bar handlers.
	const handleAction = useCallback(
		(action: BetActionKind): void => {
			if (action === "kill") {
				setConsequenceDialog({ open: true });
			} else if (action === "activate") {
				void handleActivate();
			} else if (action === "unblock") {
				// Scroll to and focus the composer textarea in HostThreadSection.
				const textarea = document.querySelector<HTMLTextAreaElement>(
					'[data-testid="composer-textarea"]',
				);
				if (textarea) {
					textarea.scrollIntoView({ block: "nearest" });
					textarea.focus();
				}
			}
		},
		[handleActivate],
	);

	/**
	 * AC2: Save bet retro via POST /api/bets/:id/retro.
	 * Writes verdict + summary + optional learnings, creates a retro knowledge item.
	 *
	 * @lore AC2: Replaces the AC1 POST /outcome call for the outcome section UI.
	 * The AC1 endpoint is preserved — this is a new, richer endpoint that also
	 * creates a retro knowledge item atomically.
	 */
	const handleOutcomeSave = useCallback(async (): Promise<void> => {
		if (!(bet && outcomeVerdictForm)) return;
		setOutcomeSaving(true);
		setOutcomeError(null);
		try {
			const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/retro`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					verdict: outcomeVerdictForm,
					summary: outcomeSummaryForm || "",
					learnings: retroLearningsForm || undefined,
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `Outcome save failed: ${res.status}`);
			}
			setOutcomeEditMode("view");
			fetched.refresh();
		} catch (err) {
			setOutcomeError(err instanceof Error ? err.message : String(err));
		} finally {
			setOutcomeSaving(false);
		}
	}, [bet, outcomeVerdictForm, outcomeSummaryForm, retroLearningsForm, fetched]);

	/**
	 * AC2: Call POST /api/bets/:id/retro/draft to get an AI-assisted draft.
	 * Pre-fills verdict, summary, and learnings form fields.
	 * On failure, shows error message but keeps form usable.
	 */
	const handleRetroDraft = useCallback(async (): Promise<void> => {
		if (!bet) return;
		setRetroDrafting(true);
		setRetroDraftError(null);
		try {
			const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/retro/draft`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (!res.ok) throw new Error("Draft failed");
			const draft = (await res.json()) as { verdict: string; summary: string; learnings: string };
			setOutcomeVerdictForm(draft.verdict as BetOutcomeVerdict);
			setOutcomeSummaryForm(draft.summary);
			setRetroLearningsForm(draft.learnings);
		} catch {
			setRetroDraftError("Could not generate draft. Fill in manually.");
		} finally {
			setRetroDrafting(false);
		}
	}, [bet]);

	// AD5 AC-5: endpoint is always "kill" (pause removed)
	const handleConsequenceConfirm = useCallback(
		async (reason: string): Promise<void> => {
			if (!bet) return;
			const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/kill`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `kill failed: ${res.status}`);
			}
			setConsequenceDialog((prev) => ({ ...prev, open: false }));
			fetched.refresh();
		},
		[bet, fetched],
	);

	// Explicit prop loading takes priority (used by Loading story).
	if (loading || (!overrideBet && fetched.loading)) {
		return (
			<PageScaffold
				frame="page"
				header={
					<PageHeader
						title="Bet"
						subtitle={<span className="skeleton block h-[13px] w-[120px]" />}
					/>
				}
				data-testid="work-bet-page"
			>
				<div className="p-[24px]">
					<SkeletonCard ariaLabel="Loading bet" />
					<SkeletonList rows={4} ariaLabel="Loading tasks" />
				</div>
			</PageScaffold>
		);
	}

	if (!overrideBet && fetched.error) {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Bet" />} data-testid="work-bet-page">
				<div className="p-[24px]">
					<ErrorState title="Failed to load bet" description={fetched.error.message} />
				</div>
			</PageScaffold>
		);
	}

	if (!bet) {
		return (
			<PageScaffold frame="page" header={<PageHeader title="Bet" />} data-testid="work-bet-page">
				<div className="p-[24px]">
					<ErrorState title="Bet not found" description="The requested bet could not be found." />
				</div>
			</PageScaffold>
		);
	}

	/**
	 * L18: "Discuss" handler — called when the user selects "Discuss" on a block.
	 * Sets the thread prefill and closes the popover.
	 *
	 * @lore L18: blockExcerpt is derived by text-querying the block DOM element.
	 * We cannot read the block's content from React state because BetPitch renders
	 * via deriveBlocks and we only have the block id here. The DOM is the ground
	 * truth at the moment the user interacts.
	 */
	function handleDiscussBlock(blockId: string): void {
		// Derive an excerpt from the block's DOM text content.
		const blockEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		setThreadPrefill({ blockId, blockExcerpt });
		setOpenBlockId(null);
	}

	/**
	 * T4: "Share" handler — attaches the block as a context ref in the Assistant overlay.
	 * Only available when the overlay is open (per reviewer critique: Share action
	 * must handle the case where overlay is not open).
	 *
	 * @lore T4: Uses AssistantContext.attachContext which is a no-op when overlayOpen=false.
	 * The "Share" menu item is conditionally included so it only appears when the
	 * overlay is open — matching the AssistantAttachButton behavior.
	 */
	function handleShareBlock(blockId: string): void {
		// Guard: this function is only reachable after the `if (!bet) return` early exit above.
		if (!bet) return;
		const blockEl = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
		const rawText = blockEl?.textContent?.trim() ?? "";
		const blockExcerpt = rawText.slice(0, 60) || blockId;
		attachContext({
			kind: "block",
			blockId,
			hostKind: "bet",
			hostId: bet.id,
			label: blockExcerpt,
		});
		setOpenBlockId(null);
	}

	// AI4: statusBadgeClass/statusBadgeLabel IIFEs deleted — now use StatusChip + BET_STATUS_LABEL.

	return (
		<PageScaffold
			frame="page"
			data-testid="work-bet-page"
			header={
				/* AI7: PageHeader owns the pinned title strip. */
				<PageHeader
					title={bet.title}
					leading={
						/* AG4: Breadcrumb — DS Breadcrumb replaces hand-rolled nav */
						<Breadcrumb
							segments={[{ label: "Work", to: "/work" }, { label: bet.team }, { label: bet.title }]}
							leading={
								!sidebarMobile ? (
									<NavHistoryCluster onBack={() => navigate(-1)} onForward={() => navigate(1)} />
								) : undefined
							}
							LinkComponent={RRLink}
						/>
					}
					actions={
						<div className="flex items-center gap-[9px]">
							<AssistantAttachButton ref={{ kind: "bet", id: bet.id, label: bet.title }} />
							<StatusChip
								status={betStatusToStatus(bet.status)}
								label={BET_STATUS_LABEL[bet.status]}
							/>
							{/* W3 AC-19: overflow action menu */}
							{/* AG5: Bet overflow menu — caller-owned trigger (bet-overflow-btn untouched per C4),
						    Menu component handles panel/items/Escape/click-outside/keyboard. */}
							<div className="relative" data-testid="bet-overflow-menu">
								<button
									type="button"
									aria-label="More actions"
									data-testid="bet-overflow-btn"
									aria-haspopup="menu"
									aria-expanded={betOverflowOpen}
									/* AI5 AQ-015: hit-area expansion only (AG5 menu trigger stays a button). */
									className="border-width-default inline-flex items-center justify-center w-[32px] h-[32px] min-h-[44px] min-w-[44px] xl:min-h-[32px] xl:min-w-[32px] rounded-[var(--r-pill)] border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] cursor-pointer hover:border-[var(--accent-deep)] hover:text-[var(--text-primary)]"
									onClick={() => setBetOverflowOpen((v) => !v)}
								>
									<svg aria-hidden="true" viewBox="0 0 16 16" className="h-[16px] w-[16px]">
										<circle cx="3" cy="8" r="1" fill="currentColor" />
										<circle cx="8" cy="8" r="1" fill="currentColor" />
										<circle cx="13" cy="8" r="1" fill="currentColor" />
									</svg>
								</button>
								<Menu
									open={betOverflowOpen}
									onClose={() => setBetOverflowOpen(false)}
									label="Bet actions"
									align="end"
									items={[
										{
											id: "add-knowledge",
											label: "Add knowledge",
											icon: (
												<svg
													viewBox="0 0 16 16"
													className="w-[16px] h-[16px]"
													fill="none"
													stroke="currentColor"
													strokeWidth="1.5"
													aria-hidden="true"
												>
													<path d="M8 3v10M3 8h10" strokeLinecap="round" />
												</svg>
											),
											onSelect: () => setAddKnowledgeOpen(true),
											dataAttrs: { "data-bet-action": "add-knowledge" },
										} satisfies MenuItem,
										...(bet.status === "draft"
											? [
													{
														id: "activate",
														label: "Activate bet",
														icon: (
															<svg
																viewBox="0 0 16 16"
																className="w-[16px] h-[16px]"
																fill="currentColor"
																aria-hidden="true"
															>
																<path d="M5 3.5l8 4.5-8 4.5V3.5z" />
															</svg>
														),
														onSelect: () => handleAction("activate"),
														dataAttrs: { "data-bet-action": "activate" },
													} satisfies MenuItem,
												]
											: []),
										...(bet.status === "active"
											? [
													{
														id: "unblock",
														label: "Unblock",
														icon: (
															<svg
																viewBox="0 0 16 16"
																className="w-[16px] h-[16px]"
																fill="none"
																stroke="currentColor"
																strokeWidth="1.5"
																aria-hidden="true"
															>
																<rect x="4" y="7" width="8" height="6" rx="1" />
																<path d="M6 7V5a2 2 0 0 1 4 0" strokeLinecap="round" />
															</svg>
														),
														onSelect: () => handleAction("unblock"),
														dataAttrs: { "data-bet-action": "unblock" },
													} satisfies MenuItem,
												]
											: []),
										...(bet.status !== "completed" && bet.status !== "killed"
											? [
													{
														id: "kill",
														label: "Kill",
														destructive: true,
														icon: (
															<svg
																viewBox="0 0 16 16"
																className="w-[16px] h-[16px]"
																fill="none"
																stroke="currentColor"
																strokeWidth="1.5"
																aria-hidden="true"
															>
																<path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
															</svg>
														),
														onSelect: () => handleAction("kill"),
														dataAttrs: { "data-bet-action": "kill" },
													} satisfies MenuItem,
												]
											: []),
									]}
								/>
							</div>
						</div>
					}
					subtitle={
						/* AF12: activate failure surface (e.g. team at capacity → clean 400). */
						activateError ? (
							<p role="alert" className="type-small  text-error">
								{activateError}
							</p>
						) : undefined
					}
				/>
			}
		>
			{/* W3 AC-25: max-width 800px centered detail body */}
			<div
				data-testid="bet-detail-body"
				className="flex flex-col gap-[24px] max-w-[800px] w-full py-[24px]"
			>
				{/* AK5: provenance backlink — shown when bet was promoted from a knowledge item. */}
				{bet.sourceKnowledge != null && (
					<RRLink
						to={`/knowledge/${bet.sourceKnowledge.id}`}
						data-testid="bet-provenance-link"
						className="type-control  text-[var(--accent-deep)] hover:underline"
					>
						From knowledge: {bet.sourceKnowledge.title}
					</RRLink>
				)}

				{/* L14: Consequence preview dialog — kill */}
				<ConsequencePreviewDialog
					open={consequenceDialog.open}
					onConfirm={handleConsequenceConfirm}
					onCancel={() => setConsequenceDialog((prev) => ({ ...prev, open: false }))}
				/>

				{/* Q2: Add knowledge dialog — locked to bet scope */}
				<KnowledgeCreateDialog
					open={addKnowledgeOpen}
					onClose={() => setAddKnowledgeOpen(false)}
					onCreated={() => setAddKnowledgeOpen(false)}
					lockedScopeKind="bet"
					lockedScopeId={bet.id}
				/>

				{/* W3 AC-20: Stat cards row — @lore UI-065: migrated from hand-rolled
					    label/value spans to KpiStat (design-system primitive). Progress bar
					    and team avatar kept below KpiStat for visual context. */}
				<div data-testid="bet-stats-row" className="flex gap-[18px]">
					{/* Progress stat card — AF16 T1 (Z8-019/020): branch on total>0, not object truthiness */}
					<div className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[12px] flex-1">
						{/* @lore AF16 T1: old guard `bet.progress ?` was truthy even when total=0,
							    producing 0/0=NaN. Now branch on hasTasks (total>0). */}
						{(() => {
							const total = bet.progress?.total ?? 0;
							const done = bet.progress?.done ?? 0;
							const hasTasks = total > 0;
							const pct = hasTasks
								? Math.min(100, Math.max(0, Math.round((done / total) * 100)))
								: 0;
							return (
								<>
									<KpiStat
										metrics={[
											{
												label: "Progress",
												value: hasTasks ? `${pct}%` : "—",
												sub: hasTasks ? `${done} of ${total} tasks` : "No tasks yet",
											},
										]}
									/>
									{hasTasks && (
										<div className="w-full h-[8px] bg-[var(--surface-container)] rounded-[var(--r-pill)] overflow-hidden">
											<div
												data-testid="bet-progress-bar"
												className="h-full bg-[var(--accent-primary)] rounded-[var(--r-pill)]"
												style={{ width: `${pct}%` }}
											/>
										</div>
									)}
								</>
							);
						})()}
					</div>
					{/* Team stat card
						    @lore visual-parity-audit D-11: mockup shows avatar-group + "N members"
						    but BetDetail API does not return member list. Rendering team initial
						    avatar + team name until the API exposes member data. */}
					<div
						data-stat-card="team"
						className="bg-[var(--surface-page)] rounded-[var(--r-default)] p-[18px] flex flex-col gap-[9px] flex-1"
					>
						<KpiStat metrics={[{ label: "Team", value: bet.team }]} />
						{/* AI5: shared Avatar primitive. Initials now derive via slice
							    (deriveInitials) — was word-initials ("GT"), now slice ("GR"). */}
						<div className="flex items-center gap-[9px]">
							<Avatar initials={deriveInitials(bet.team)} size="sm" className="shrink-0" />
						</div>
					</div>
				</div>

				{/* AC2: Outcome section — only shown for completed/killed bets */}
				{(bet.status === "completed" || bet.status === "killed") && (
					<section data-testid="outcome-section" aria-label="Outcome">
						<SectionLabel label="Outcome" divider />

						{outcomeEditMode === "view" ? (
							<div className="flex flex-col gap-[9px]">
								{bet.outcomeVerdict ? (
									/* AC2-12: populated state — two-column layout */
									<div
										data-testid="retro-columns"
										className="grid grid-cols-1 gap-[18px] sm:grid-cols-2"
									>
										{/* Left column: hypothesis (read-only) */}
										<div className="flex flex-col gap-[6px]">
											<span className="type-label   uppercase  text-[var(--text-tertiary)]">
												Predicted
											</span>
											{bet.hypothesis ? (
												<p
													data-testid="retro-hypothesis-display"
													className="type-small  text-[var(--text-secondary)] "
												>
													{bet.hypothesis}
												</p>
											) : (
												<p
													data-testid="retro-hypothesis-display"
													className="type-small  text-[var(--text-tertiary)] italic"
												>
													No hypothesis recorded
												</p>
											)}
										</div>
										{/* Right column: verdict + summary + actions */}
										<div className="flex flex-col gap-[9px]">
											<div className="flex items-center gap-[9px]">
												{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: span receives aria-label for test/screen-reader accessibility */}
												<span
													data-testid="outcome-verdict-badge"
													aria-label={`Outcome: ${bet.outcomeVerdict}`}
												>
													<StatusChip
														status={betOutcomeVerdictToStatus(
															bet.outcomeVerdict as BetOutcomeVerdict,
														)}
														label={
															BET_OUTCOME_VERDICT_LABEL[bet.outcomeVerdict as BetOutcomeVerdict] ??
															bet.outcomeVerdict
														}
													/>
												</span>
												<button
													type="button"
													className="type-control  text-[var(--accent-deep)] hover:underline cursor-pointer"
													onClick={() => {
														setOutcomeVerdictForm(bet.outcomeVerdict ?? "");
														setOutcomeSummaryForm(bet.outcomeSummary ?? "");
														setRetroLearningsForm("");
														setOutcomeEditMode("editing");
													}}
												>
													Edit outcome
												</button>
											</div>
											{bet.outcomeSummary && (
												<p className="type-small  text-[var(--text-secondary)] ">
													{bet.outcomeSummary}
												</p>
											)}
										</div>
									</div>
								) : (
									/* Not evaluated state */
									<div className="flex items-center gap-[9px]">
										<span className="type-small  text-[var(--text-tertiary)]">Not evaluated</span>
										<button
											type="button"
											className="type-control  text-[var(--accent-deep)] hover:underline cursor-pointer"
											onClick={() => {
												setOutcomeVerdictForm("");
												setOutcomeSummaryForm("");
												setRetroLearningsForm("");
												setRetroDraftError(null);
												setOutcomeEditMode("editing");
											}}
										>
											Record outcome
										</button>
									</div>
								)}
							</div>
						) : (
							/* AC2: Editing state — two-column form — aria-label required by Design W-2 */
							<form
								aria-label="Record bet outcome"
								className="flex flex-col gap-[12px]"
								onSubmit={(e) => {
									e.preventDefault();
									void handleOutcomeSave();
								}}
							>
								{/* Two-column grid: hypothesis left, form right */}
								<div
									data-testid="retro-columns"
									className="grid grid-cols-1 gap-[18px] sm:grid-cols-2"
								>
									{/* Left column: hypothesis (read-only) */}
									<div className="flex flex-col gap-[6px]">
										<span className="type-label   uppercase  text-[var(--text-tertiary)]">
											Predicted
										</span>
										{bet.hypothesis ? (
											<p
												data-testid="retro-hypothesis-display"
												className="type-small  text-[var(--text-secondary)] "
											>
												{bet.hypothesis}
											</p>
										) : (
											<p
												data-testid="retro-hypothesis-display"
												className="type-small  text-[var(--text-tertiary)] italic"
											>
												No hypothesis recorded
											</p>
										)}
									</div>
									{/* Right column: Draft with AI + form fields */}
									<div className="flex flex-col gap-[12px]">
										{/* Draft with AI button */}
										<div className="flex items-center gap-[9px]">
											<Button
												variant="secondary"
												size="sm"
												disabled={retroDrafting}
												onClick={() => void handleRetroDraft()}
											>
												{retroDrafting ? "Drafting…" : "Draft with AI"}
											</Button>
											{retroDraftError && (
												<span className="type-metadata  text-[var(--status-error)]">
													{retroDraftError}
												</span>
											)}
										</div>
										{/* Verdict select */}
										<div className="flex flex-col gap-[6px]">
											<label
												htmlFor="outcome-verdict-select"
												className="type-metadata   text-[var(--text-secondary)]"
											>
												Verdict
											</label>
											<Select
												id="outcome-verdict-select"
												size="sm"
												value={outcomeVerdictForm}
												onChange={(e) =>
													setOutcomeVerdictForm(e.target.value as typeof outcomeVerdictForm)
												}
												placeholder="Select verdict…"
												options={BET_OUTCOME_VERDICTS.map((v) => ({
													value: v,
													label: BET_OUTCOME_VERDICT_LABEL[v] ?? v,
												}))}
											/>
										</div>
										{/* Reality / summary textarea */}
										<Input
											textarea
											id="outcome-summary-textarea"
											data-testid="retro-summary-textarea"
											label="Reality"
											placeholder="What actually happened?"
											value={outcomeSummaryForm}
											onChange={(e) => setOutcomeSummaryForm(e.target.value)}
										/>
										{/* Learnings textarea */}
										<Input
											textarea
											id="retro-learnings-textarea"
											data-testid="retro-learnings-textarea"
											label="Learnings (optional)"
											placeholder="What did you learn from this bet?"
											value={retroLearningsForm}
											onChange={(e) => setRetroLearningsForm(e.target.value)}
										/>
									</div>
								</div>
								{/* Error */}
								{outcomeError && (
									<p className="type-metadata  text-[var(--status-error)]">{outcomeError}</p>
								)}
								{/* Actions */}
								<div className="flex gap-[9px] justify-end">
									<Button
										variant="ghost"
										size="sm"
										disabled={outcomeSaving}
										onClick={() => setOutcomeEditMode("view")}
									>
										Cancel
									</Button>
									<Button
										type="submit"
										variant="primary"
										size="sm"
										disabled={!outcomeVerdictForm || outcomeSaving}
									>
										{outcomeSaving ? "Saving…" : "Save"}
									</Button>
								</div>
							</form>
						)}
					</section>
				)}

				{/* W3 AC-21: Pitch section with save indicator */}
				<section data-testid="bet-pitch-section" aria-label="Pitch">
					<SectionLabel
						label="Pitch"
						divider
						trailing={
							/* C-01: For draft/active (canEditDescription=true), show save-status indicator.
								   For completed/killed (canEditDescription=false), hide entirely — pitch is immutable. */
							canEditDescription ? (
								<div className="flex items-center gap-[9px]">
									<span
										className="type-metadata  text-[var(--status-success)] flex items-center gap-[3px]"
										aria-live="polite"
										data-testid="pitch-save-indicator"
									>
										{saveStatus === "saving" && "Saving..."}
										{saveStatus === "saved" && (
											<>
												<svg
													width="12"
													height="12"
													viewBox="0 0 12 12"
													fill="none"
													aria-hidden="true"
												>
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
										{saveStatus === "error" && (
											<span className="text-[var(--status-error)]">Save failed</span>
										)}
									</span>
									<Button
										variant="ghost"
										size="sm"
										aria-label={
											descriptionEditing ? "Done editing bet content" : "Edit bet content"
										}
										disabled={
											descriptionEditing && (saveStatus === "saving" || saveStatus === "error")
										}
										onClick={() => setDescriptionEditing((editing) => !editing)}
									>
										{descriptionEditing ? "Done" : "Edit"}
									</Button>
								</div>
							) : undefined
						}
					/>
					{/* T3: Conditional rendering based on bet status mutability. */}
					{canEditDescription && descriptionEditing ? (
						<div className="flex flex-col gap-[9px]" data-testid="bet-description-editor">
							<BodyEditor
								initialContent={bet.description}
								onChange={handleDescriptionChange}
								placeholder="Describe this bet..."
								variant="full"
								minHeight="200px"
							/>
							<span
								className="type-metadata  text-[var(--text-tertiary)]"
								aria-live="polite"
								data-testid="bet-save-indicator"
							>
								{saveStatus === "saving" && "Saving..."}
								{saveStatus === "saved" && "Saved"}
								{saveStatus === "error" && (
									<span className="text-[var(--status-error)]" role="alert">
										Save failed — retry
									</span>
								)}
							</span>
						</div>
					) : (
						<>
							{/* L18: Block popover wiring */}
							<BetPitch
								description={bet.description}
								betId={bet.id}
								documentTitle={bet.title}
								onOpenBlockActions={(blockId) => setOpenBlockId(blockId)}
								messagesByBlockId={messagesByBlockId}
								onShareBlock={handleShareBlock}
							/>
						</>
					)}
				</section>

				{/* L18 + T4: Block actions popover — rendered at page level, opened from any block.
			    T4: "Share" action added; only shown when CoC overlay is open (per reviewer
			    critique: Share must not be shown when overlay is closed). */}
				{openBlockId !== null && (
					<BlockActionsPopover
						id={`block-popover-${openBlockId}`}
						open
						onClose={() => setOpenBlockId(null)}
						liveRegionId="block-popover-live"
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

				{/*
				 * W3 AC-22: flat task rows (no table). Each row is clickable and navigates
				 * to the task detail page. Status is shown as a StatusChip badge, not a dot.
				 *
				 * @lore W3: The task table (sortable headers, outcome column, cost column) is
				 * replaced by a flat list of task-row buttons matching the mockup. Rows have
				 * border-bottom dividers (last:border-b-0). No horizontal padding, no rounding.
				 */}
				{/*
				 * AU21 §9 Increment 10a (Decision I): two-state tasks section.
				 * Precedence (approved.md binding): tasks>0 first, then draft, then the
				 * honest "no tasks yet" state. Core no longer auto-decomposes a
				 * committed bet (the built-in bet_decomposition mechanism is removed
				 * entirely) — the prior Decomposing/Blocked auto-decompose states are
				 * gone; a committed bet with zero tasks just says so.
				 */}
				<section aria-label="Tasks">
					<SectionLabel label="Tasks" divider />

					{bet.tasks.length > 0 ? (
						/* State 1: Populated — tasks>0 beats all other states (approved.md precedence). */
						<div className="flex flex-col">
							{sortedTasks.map((task) => {
								/* NEW-19: stateLabel removed from metaParts — the StatusChip on
								 * the right is the single status representation. Keeping it in the
								 * subtitle text as well duplicated the fact and a "done + verdict"
								 * row showed three status indicators for one fact. */
								const relTime = task.startedAt ? relativeLong(task.startedAt) : "";
								const metaParts = [task.owner, relTime].filter(Boolean);
								return (
									// @lore UI-080: <a href> so ⌘-click / middle-click work natively.
									// StatusChip / LiveDot inside are display-only — valid inside <a>.
									<a
										key={task.id}
										data-testid="task-row"
										href={`/work/bet/${encodeURIComponent(bet.id)}/task/${encodeURIComponent(task.id)}`}
										// @lore AZ7 N1: hover:bg-[var(--accent-primary-dim)] is Set 3's
										// row-hover tint — not a no-handrolled-control violation.
										className="flex items-center gap-[12px] py-[12px] border-width-thin-b border-[var(--border-subtle)] last:border-none cursor-pointer hover:bg-[var(--accent-primary-dim)] text-left w-full"
										aria-label={task.title}
									>
										<div className="flex-1 min-w-0">
											<div className="type-copy  text-[var(--text-primary)] truncate">
												{task.title}
											</div>
											<div className="type-metadata  text-[var(--text-tertiary)] truncate mt-[3px]">
												{metaParts.join(" · ")}
											</div>
										</div>
										{/* AI4 AC1: Task outcome verdict badge — shown when verdict is set */}
										{task.outcomeVerdict && (
											<span data-testid={`task-outcome-badge-${task.id}`}>
												<StatusChip
													status={taskOutcomeVerdictToStatus(task.outcomeVerdict)}
													label={
														TASK_OUTCOME_VERDICT_LABEL[task.outcomeVerdict] ?? task.outcomeVerdict
													}
												/>
											</span>
										)}
										{/* AI4 AC1: State chip — hidden when outcome verdict chip is shown
										 * (NEW-19: outcome verdict already implies the task is done;
										 * showing both chips is redundant). */}
										{!task.outcomeVerdict && (
											<span className="flex items-center gap-[6px]">
												{task.state === "in_progress" && <LiveDot />}
												<StatusChip
													status={taskStateToStatus(task.state)}
													label={TASK_STATE_LABEL[task.state]}
												/>
											</span>
										)}
									</a>
								);
							})}
						</div>
					) : bet.status === "draft" ? (
						/* State 2: Draft — bet not yet committed. Core no longer
						 * auto-decomposes on commit (AU21 Decision I removed the built-in
						 * bet_decomposition mechanism) — copy must not promise automatic
						 * behavior core itself no longer provides. */
						<EmptyState
							title="Not committed yet"
							description="Commit this bet to start adding tasks."
							dataTestId="bet-tasks-draft"
						/>
					) : (
						/* State 3: No tasks yet — a committed/active bet with zero tasks.
						 * Honest replacement for the removed auto-decompose
						 * Decomposing/Blocked states (AU21 §9 Increment 10a / Decision I). */
						<EmptyState
							title="No tasks yet"
							description="Add a task, or attach an agent to this bet, to get work started."
							action={
								bet.teamId ? (
									<RRLink to={`/work/team/${bet.teamId}`}>
										<Button variant="secondary">Add an agent</Button>
									</RRLink>
								) : undefined
							}
							dataTestId="bet-tasks-empty"
						/>
					)}
				</section>

				{/* L12 (B-1): ArtifactSection inserted BEFORE HostThreadSection, not between
			    HostThreadSection and ArtifactThreadsSummary. Bet axis, stack layout, no limit. */}
				<ArtifactSection
					filter={{ axis: "bet", betId: bet.id }}
					layout="stack"
					heading="Artifacts"
					emptyDescription="Artifacts appear as agents complete tasks on this bet."
					onOpen={onOpenArtifact}
				/>

				{/* L18: Replace hardcoded comment fixture with real thread surface.
			    prefill carries the blockId so the composer includes it on submit.
			    onClearPrefill lets the user dismiss the Re: chip.
			    onMessagePosted refreshes the WorkBet-level thread data so that
			    messagesByBlockId stays in sync with newly posted anchored messages. */}
				<HostThreadSection
					hostKind="bet"
					hostId={bet.id}
					title="Discussion"
					prefill={threadPrefill}
					onClearPrefill={() => setThreadPrefill(undefined)}
					onMessagePosted={refreshThreadData}
				/>

				{/* L18: Per-bet artifact thread summary */}
				<ArtifactThreadsSummary betId={bet.id} />
			</div>
			{/* end bet-detail-body */}
		</PageScaffold>
	);
}
