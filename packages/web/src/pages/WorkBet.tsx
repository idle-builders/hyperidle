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
import {
	BetCard,
	Block,
	BlockActionsPopover,
	BodyEditor,
	EmptyState,
	ErrorState,
	KeyValue,
	SkeletonCard,
	SkeletonList,
	StatusChip,
	sessionOutcomeToStatus,
	taskStateToStatus,
} from "@hyperidle/design-system";
import type { BetStatus, Message } from "@hyperidle/shared";
import {
	deriveBlocks,
	formatMoney,
	formatTokenCount,
	isRedactedPayload,
	totalTokens,
} from "@hyperidle/shared";
import { type JSX, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactSection, useArtifactOpen } from "../components/ArtifactSection.js";
import { ArtifactThreadsSummary } from "../components/ArtifactThreadsSummary.js";
import { CocAttachButton } from "../components/CocAttachButton";
import { CocContext } from "../contexts/CocContext.js";
import { useBet } from "../hooks/useBet";
import { useBetDescriptionSave } from "../hooks/useBetDescriptionSave.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";
import { useHint } from "../hooks/useHints";
import { useHostThread } from "../hooks/useHostThread.js";
import { isValidHarnessUrl } from "../lib/url-utils.js";
import { apiFetch } from "../services/api-fetch.js";
import { postRequestMessage, resolveOrCreateTaskThread } from "../services/task-threads";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { TaskSheet } from "../shell/TaskSheet";
import type { BetDetail } from "../types/bet";
import { blockExcerptFromPayload } from "../utils/block-excerpt.js";
import { KnowledgeCreateDialog } from "./knowledge/KnowledgeCreateDialog";

// L17: "cost" column maps to costActual (WireMoney|null); sort by minor units.
// L19: "outcome" column added for latest session outcome sort.
type SortColumn = "title" | "status" | "owner" | "costActual" | "outcome";
type SortDirection = "asc" | "desc";

/**
 * T3: Bet statuses where the description is mutable (editable via BodyEditor).
 * Immutable statuses (completed, killed) render the read-only BetPitch (block view).
 *
 * @lore T3: Mirrors server-side DESCRIPTION_MUTABLE_IN_STATUSES in bets.ts.
 * The frontend check is defense-in-depth; the server enforces the constraint too.
 */
const BET_DESCRIPTION_MUTABLE_STATUSES = new Set<BetStatus>(["draft", "active"]);

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
		if (column === "costActual") {
			// L17: costActual is WireMoney|null; sort by minor integer units.
			av = a.costActual?.minor ?? 0;
			bv = b.costActual?.minor ?? 0;
		} else if (column === "outcome") {
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
		<div data-testid="anchored-messages" className="flex flex-col gap-1 mt-1">
			{anchorLost && (
				<span
					data-testid="anchor-lost-indicator"
					className="text-xs text-[var(--text-tertiary)] italic"
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
						className="text-xs text-[var(--text-tertiary)] px-2 py-1 bg-[var(--surface-container)] rounded"
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
	/** Called when the user opens a block's actions menu (Space/Enter on block). Sets openBlockId. */
	onOpenBlockActions?: (blockId: string) => void;
	messagesByBlockId?: ReadonlyMap<string, ReadonlyArray<Message>>;
	/** T4: Called when the user clicks "Share" on a block. Attaches as context ref in CoC. */
	onShareBlock?: (blockId: string) => void;
}

function BetPitch({
	description,
	betId,
	onOpenBlockActions,
	messagesByBlockId,
	onShareBlock,
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
		const renderedBlockIds = new Set(blocks.map((b) => b.id));
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
			{blocks.map((b) => (
				// T4: relative wrapper so CocAttachButton can be absolutely positioned in the gutter.
				<div key={b.id} className="relative group/block-attach">
					<Block
						id={b.id}
						payload={b.payload}
						onOpenActions={
							onOpenBlockActions !== undefined ? () => onOpenBlockActions(b.id) : undefined
						}
						slots={{
							inlineAfterPayload: messagesByBlockId ? (
								<AnchoredMessages messages={messagesByBlockId.get(b.id) ?? []} />
							) : undefined,
						}}
					/>
					{/* T4: CocAttachButton — shows when overlay is open, attaches block ref */}
					<CocAttachButton
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
 */
type BetActionKind = "pause" | "resume" | "kill" | "adjust-appetite" | "unblock";

/**
 * BetActionsBar — co-located action bar rendered below the BetCard.
 *
 * @lore L14: co-located (not a design-system component) because this is a
 * single-call-site adapter that ties bet status to HTTP verbs. It would not
 * earn its keep as a shared component.
 *
 * @lore L14: blocked → paused is NOT in VALID_TRANSITIONS (state machine).
 * Per the architecture-critique, Pause is NOT shown for blocked bets. A blocked
 * bet cannot be paused; the Unblock action is the intended path.
 */
interface BetActionsBarProps {
	bet: BetDetail;
	onAction: (action: BetActionKind) => void;
}

function BetActionsBar({ bet, onAction }: BetActionsBarProps): JSX.Element | null {
	const { status } = bet;
	// @lore U1: old "shipped"/"killed" → "completed"/"killed"; old "in_progress"/"paused"/"behind"/"blocked"/"shaped" → "active"/"draft"
	if (status === "completed" || status === "killed") return null;

	const showPause = status === "active";
	const showResume = false; // no paused status in new enum
	const showAdjust = status === "active" || status === "draft";
	const showUnblock = status === "active";
	const showKill = true;

	return (
		<div
			className="flex flex-wrap gap-2 items-center"
			data-testid="bet-actions-bar"
			role="group"
			aria-label="Bet actions"
		>
			{showPause && (
				<button type="button" className="btn btn-xs btn-ghost" onClick={() => onAction("pause")}>
					Pause
				</button>
			)}
			{showResume && (
				<button type="button" className="btn btn-xs btn-ghost" onClick={() => onAction("resume")}>
					Resume
				</button>
			)}
			{showAdjust && (
				<button
					type="button"
					className="btn btn-xs btn-ghost"
					onClick={() => onAction("adjust-appetite")}
				>
					Adjust appetite
				</button>
			)}
			{showUnblock && (
				<button type="button" className="btn btn-xs btn-ghost" onClick={() => onAction("unblock")}>
					Unblock
				</button>
			)}
			{showKill && (
				<button type="button" className="btn btn-xs btn-error" onClick={() => onAction("kill")}>
					Kill bet
				</button>
			)}
		</div>
	);
}

/**
 * ConsequencePreviewDialog — non-skippable confirmation dialog for destructive
 * or pause actions. The user must explicitly Cancel or provide a reason and
 * confirm. Escape and backdrop click do not close the dialog.
 *
 * @lore L14: native <dialog> with showModal() is used for the Escape-prevention
 * guarantee. We cancel the `cancel` event (fired before `close` by Escape key)
 * and prevent the default close behavior. Clicking the backdrop fires the
 * `cancel` event first in Chrome/Safari; capturing it at the dialog level
 * prevents close on backdrop click as well.
 *
 * @lore L14: The dialog renders via React state (open prop) rather than
 * imperative showModal() so that tests can inspect it in JSDOM via
 * getByRole("dialog"). We call showModal() in a useEffect so the native
 * element is synchronised with React state.
 */
interface ConsequencePreviewDialogProps {
	open: boolean;
	kind: "pause" | "kill";
	onConfirm: (reason: string) => Promise<void>;
	onCancel: () => void;
}

function ConsequencePreviewDialog({
	open,
	kind,
	onConfirm,
	onCancel,
}: ConsequencePreviewDialogProps): JSX.Element | null {
	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isKill = kind === "kill";
	const confirmLabel = isKill ? "Kill bet" : "Pause bet";
	const title = isKill ? "Kill this bet?" : "Pause this bet?";

	const dialogRef = useRef<HTMLDialogElement>(null);

	// Sync native dialog open/closed state with the `open` prop.
	// @lore L14: showModal() is guarded with typeof check because JSDOM (used in
	// Vitest) does not implement it. In production (real browser) showModal() is
	// always available on HTMLDialogElement. The open attribute on the <dialog>
	// element drives JSDOM's getByRole("dialog") visibility, so tests work without
	// the native method.
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			setReason("");
			setError(null);
			setSubmitting(false);
			if (!dialogRef.current.open) {
				if (typeof dialogRef.current.showModal === "function") {
					dialogRef.current.showModal();
				} else {
					dialogRef.current.setAttribute("open", "");
				}
			}
		} else if (dialogRef.current.open) {
			if (typeof dialogRef.current.close === "function") {
				dialogRef.current.close();
			} else {
				dialogRef.current.removeAttribute("open");
			}
		}
	}, [open]);

	// Prevent Escape (and backdrop click) from closing the dialog (AC-8).
	// @lore L14: the native dialog `cancel` event fires before `close` when the
	// user presses Escape or clicks the backdrop. Calling e.preventDefault()
	// here is the only reliable cross-browser way to make a dialog non-closable
	// by those means.
	useEffect(() => {
		const el = dialogRef.current;
		if (!el) return;
		const handleCancel = (e: Event): void => {
			e.preventDefault();
		};
		el.addEventListener("cancel", handleCancel);
		return (): void => {
			el.removeEventListener("cancel", handleCancel);
		};
	}, []);

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
		<dialog ref={dialogRef} aria-modal="true" aria-label={title}>
			<div className="p-4 flex flex-col gap-3 min-w-[320px] max-w-[480px]">
				<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">{title}</h2>

				<div className="text-xs text-[var(--text-tertiary)] space-y-1">
					{isKill ? (
						<>
							<p>
								<span className="font-semibold text-error">STOPS:</span> All active tasks will be
								halted.
							</p>
							<p>
								<span className="font-semibold text-[var(--text-primary)]">CONTINUES:</span>{" "}
								Existing artifacts are preserved.
							</p>
							<p>
								<span className="font-semibold text-[var(--text-primary)]">SAVED:</span> Team
								capacity is freed immediately.
							</p>
						</>
					) : (
						<>
							<p>
								<span className="font-semibold text-error">STOPS:</span> All agent sessions will be
								suspended. No new tasks will start.
							</p>
							<p>
								<span className="font-semibold text-[var(--text-primary)]">CONTINUES:</span> The bet
								remains in your portfolio.
							</p>
							<p>
								<span className="font-semibold text-[var(--text-primary)]">SAVED:</span> All
								completed tasks and artifacts are unaffected. The bet, its tasks, and revision log
								are preserved in full.
							</p>
						</>
					)}
				</div>

				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">
						Reason <span aria-hidden>(required)</span>
					</span>
					<textarea
						className="textarea textarea-bordered text-base resize-none h-20"
						placeholder={isKill ? "Why is this bet being killed?" : "Why is this bet being paused?"}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						disabled={submitting}
						maxLength={500}
					/>
				</label>

				{error && (
					<p role="alert" className="text-xs text-error">
						{error}
					</p>
				)}

				<div className="flex gap-2 justify-end">
					<button
						type="button"
						className="btn btn-xs btn-ghost"
						onClick={onCancel}
						disabled={submitting}
					>
						Cancel
					</button>
					<button
						type="button"
						className={`btn btn-xs ${isKill ? "btn-error" : "btn-primary"}`}
						onClick={() => void handleConfirm()}
						disabled={!reason.trim() || submitting}
					>
						{submitting ? "…" : confirmLabel}
					</button>
				</div>
			</div>
		</dialog>
	);
}

/**
 * AppetiteDialog — lets the founder adjust the bet appetite with a reason.
 *
 * @lore L14: Same non-skippable dialog pattern as ConsequencePreviewDialog.
 * Escape is cancelled; backdrop click is blocked by the native dialog modal
 * cancel event handler.
 */
interface AppetiteDialogProps {
	open: boolean;
	currentAppetite: string;
	onConfirm: (appetite: string, reason: string) => Promise<void>;
	onCancel: () => void;
}

const APPETITE_OPTIONS = ["1 week", "2 weeks", "6 weeks"] as const;

function AppetiteDialog({
	open,
	currentAppetite,
	onConfirm,
	onCancel,
}: AppetiteDialogProps): JSX.Element | null {
	const validDefault = (APPETITE_OPTIONS as readonly string[]).includes(currentAppetite)
		? currentAppetite
		: APPETITE_OPTIONS[1];

	const [selected, setSelected] = useState(validDefault);
	const [reason, setReason] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const dialogRef = useRef<HTMLDialogElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset only when open changes
	useEffect(() => {
		if (!dialogRef.current) return;
		if (open) {
			setSelected(validDefault);
			setReason("");
			setError(null);
			setSubmitting(false);
			if (!dialogRef.current.open) {
				if (typeof dialogRef.current.showModal === "function") {
					dialogRef.current.showModal();
				} else {
					dialogRef.current.setAttribute("open", "");
				}
			}
		} else if (dialogRef.current.open) {
			if (typeof dialogRef.current.close === "function") {
				dialogRef.current.close();
			} else {
				dialogRef.current.removeAttribute("open");
			}
		}
	}, [open]);

	useEffect(() => {
		const el = dialogRef.current;
		if (!el) return;
		const handleCancel = (e: Event): void => {
			e.preventDefault();
		};
		el.addEventListener("cancel", handleCancel);
		return (): void => {
			el.removeEventListener("cancel", handleCancel);
		};
	}, []);

	const handleSave = async (): Promise<void> => {
		const trimmed = reason.trim();
		if (!trimmed) return;
		setSubmitting(true);
		setError(null);
		try {
			await onConfirm(selected, trimmed);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update appetite.");
			setSubmitting(false);
		}
	};

	return (
		<dialog ref={dialogRef} aria-modal="true" aria-label="Adjust appetite">
			<div className="p-4 flex flex-col gap-3 min-w-[320px] max-w-[400px]">
				<h2 className="text-sm font-heading font-semibold uppercase tracking-wider">
					Adjust appetite
				</h2>

				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">New appetite</span>
					<select
						className="select select-bordered select-sm"
						value={selected}
						onChange={(e) => setSelected(e.target.value)}
						disabled={submitting}
					>
						{APPETITE_OPTIONS.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</label>

				<label className="flex flex-col gap-1">
					<span className="text-xs text-[var(--text-tertiary)]">
						Reason <span aria-hidden>(required)</span>
					</span>
					<textarea
						className="textarea textarea-bordered text-base resize-none h-16"
						placeholder="Why is the appetite changing?"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						disabled={submitting}
						maxLength={500}
					/>
				</label>

				{error && (
					<p role="alert" className="text-xs text-error">
						{error}
					</p>
				)}

				<div className="flex gap-2 justify-end">
					<button
						type="button"
						className="btn btn-xs btn-ghost"
						onClick={onCancel}
						disabled={submitting}
					>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-xs btn-primary"
						onClick={() => void handleSave()}
						disabled={!reason.trim() || submitting}
					>
						{submitting ? "…" : "Save"}
					</button>
				</div>
			</div>
		</dialog>
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
	const { user } = useCurrentUser();
	const onOpenArtifact = useArtifactOpen();
	const hintAddCredential = useHint("add-credential");
	// T4: CocContext for block share action
	const { overlayOpen, attachContext } = useContext(CocContext);

	// Only call useBet when there is no override. When overrideBet is provided,
	// pass undefined so the hook short-circuits to { data: null, loading: false, error: null }.
	const fetched = useBet(overrideBet ? undefined : routeBetId);

	const bet = overrideBet ?? fetched.data;

	const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	// L13: TaskSheet state — selectedTaskId tracks which task row was clicked.
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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
		kind: "pause" | "kill";
	}>({ open: false, kind: "kill" });
	const [appetiteDialogOpen, setAppetiteDialogOpen] = useState(false);

	// Q2: Add knowledge dialog state.
	const [addKnowledgeOpen, setAddKnowledgeOpen] = useState(false);

	// T3: Status-based description editability.
	// @lore T3: canEditDescription derives from bet.status. BodyEditor is always
	// mounted for draft/active bets (no Edit/Done toggle). Block actions are only
	// available in immutable statuses (completed/killed) via BetPitch.
	const canEditDescription = bet ? BET_DESCRIPTION_MUTABLE_STATUSES.has(bet.status) : false;

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

	const sortedTasks = useMemo(
		() => sortTasks(bet?.tasks ?? [], sortColumn, sortDirection),
		[bet?.tasks, sortColumn, sortDirection],
	);

	// L13: Derive selectedTask from the bet's task list for TaskSheet.
	const selectedTask =
		selectedTaskId !== null ? (bet?.tasks.find((t) => t.id === selectedTaskId) ?? null) : null;

	// L13: TaskSheet callbacks — mirror WorkTeam.tsx patterns.
	// @lore M3 A12: FOUNDER_ID constant deleted; use user?.id from useCurrentUser.
	const handleResolveThreadId = useCallback(
		(taskId: string): Promise<string> => resolveOrCreateTaskThread(taskId, user?.id ?? "", null),
		[user],
	);

	const handlePostRequest = useCallback(
		(threadId: string, text: string, clientKey: string): Promise<void> =>
			postRequestMessage(threadId, text, clientKey),
		[],
	);

	const handleNavigateToThread = useCallback(
		(threadId: string): void => {
			navigate(`/conversations/chat?thread=${encodeURIComponent(threadId)}`);
		},
		[navigate],
	);

	// L14: Action bar handlers. handleResume is declared first so handleAction
	// can reference it in its dependency array without a hoisting issue.
	const handleResume = useCallback(async (): Promise<void> => {
		if (!bet) return;
		const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/resume`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		if (!res.ok) {
			const body = (await res.json()) as { error?: string };
			throw new Error(body.error ?? "Failed to resume bet");
		}
		fetched.refresh();
	}, [bet, fetched]);

	const handleAction = useCallback(
		(action: BetActionKind): void => {
			if (action === "pause") {
				setConsequenceDialog({ open: true, kind: "pause" });
			} else if (action === "kill") {
				setConsequenceDialog({ open: true, kind: "kill" });
			} else if (action === "adjust-appetite") {
				setAppetiteDialogOpen(true);
			} else if (action === "resume") {
				// Resume is non-destructive — no confirmation dialog needed.
				void handleResume();
			} else if (action === "unblock") {
				// Scroll to and focus the composer textarea in HostThreadSection.
				const textarea = document.querySelector<HTMLTextAreaElement>(
					'[data-testid="composer-textarea"]',
				);
				if (textarea) {
					textarea.scrollIntoView({ behavior: "smooth", block: "nearest" });
					textarea.focus();
				}
			}
		},
		[handleResume],
	);

	const handleConsequenceConfirm = useCallback(
		async (reason: string): Promise<void> => {
			if (!bet) return;
			const endpoint = consequenceDialog.kind === "kill" ? "kill" : "pause";
			const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}/${endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ reason }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `${endpoint} failed: ${res.status}`);
			}
			setConsequenceDialog((prev) => ({ ...prev, open: false }));
			fetched.refresh();
		},
		[bet, consequenceDialog.kind, fetched],
	);

	const handleAppetiteConfirm = useCallback(
		async (appetite: string, reason: string): Promise<void> => {
			if (!bet) return;
			const res = await apiFetch(`/api/bets/${encodeURIComponent(bet.id)}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ field: "cost_appetite", value: appetite, reason }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `Appetite update failed: ${res.status}`);
			}
			setAppetiteDialogOpen(false);
			fetched.refresh();
		},
		[bet, fetched],
	);

	// Explicit prop loading takes priority (used by Loading story).
	if (loading || (!overrideBet && fetched.loading)) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<SkeletonCard ariaLabel="Loading bet" />
				<SkeletonList rows={4} ariaLabel="Loading tasks" />
			</div>
		);
	}

	if (!overrideBet && fetched.error) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<ErrorState title="Failed to load bet" description={fetched.error.message} />
			</div>
		);
	}

	if (!bet) {
		return (
			<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
				<ErrorState title="Bet not found" description="The requested bet could not be found." />
			</div>
		);
	}

	function handleSort(column: SortColumn): void {
		if (sortColumn === column) {
			setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
		} else {
			setSortColumn(column);
			setSortDirection("asc");
		}
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
	 * T4: "Share" handler — attaches the block as a context ref in the CoC overlay.
	 * Only available when the CoC overlay is open (per reviewer critique: Share action
	 * must handle the case where overlay is not open).
	 *
	 * @lore T4: Uses CocContext.attachContext which is a no-op when overlayOpen=false.
	 * The "Share" menu item is conditionally included so it only appears when the
	 * overlay is open — matching the CocAttachButton behavior.
	 */
	function handleShareBlock(blockId: string): void {
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

	return (
		<div className="flex flex-col gap-3 h-full" data-testid="work-bet-page">
			{/* J5: breadcrumb Team → Bet. The leaf node uses the
			    bet id rather than the title so the enriched BetCard below
			    remains the single rendered instance of `bet.title`. */}
			<nav aria-label="Breadcrumb" className="text-xs text-[var(--text-tertiary)]">
				<ol className="flex items-center gap-1">
					<li>
						<Link className="hover:text-[var(--text-primary)]" to="/work/portfolio">
							{bet.team}
						</Link>
					</li>
					<li aria-hidden>›</li>
					<li>
						<Link className="hover:text-[var(--text-primary)]" to="/work/team">
							{bet.team}
						</Link>
					</li>
					<li aria-hidden>›</li>
					<li className="text-[var(--text-primary)] font-medium" aria-current="page">
						<span className="uppercase font-mono">{bet.id}</span>
						<span className="sr-only">: {bet.title}</span>
					</li>
				</ol>
			</nav>

			<div className="relative">
				<BetCard
					title={bet.title}
					team={bet.team}
					status={bet.status}
					appetite={formatMoney(bet.costAppetite)}
					progress={bet.progress}
				/>
				<CocAttachButton ref={{ kind: "bet", id: bet.id, label: bet.title }} />
			</div>

			{/* L14: Bet action bar — shown for active bets only */}
			<BetActionsBar bet={bet} onAction={handleAction} />

			{/* P5: Hint #2 — add-credential. Shows when the first bet is loaded. */}
			{hintAddCredential.visible && (
				<div
					role="status"
					data-testid={hintAddCredential.testId}
					className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)]"
				>
					<p className="text-[length:var(--density-text)] text-[var(--text-secondary)] leading-[var(--leading-body)]">
						{hintAddCredential.copy}
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							className="btn btn-ghost btn-xs text-[var(--text-tertiary)] min-h-[44px]"
							onClick={hintAddCredential.dismiss}
						>
							Got it
						</button>
					</div>
				</div>
			)}

			{/* Q2: Add knowledge button — opens KnowledgeCreateDialog with bet scope locked */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="btn btn-xs btn-ghost"
					onClick={() => setAddKnowledgeOpen(true)}
				>
					Add knowledge
				</button>
			</div>

			{/* L14: Consequence preview dialog — pause or kill */}
			<ConsequencePreviewDialog
				open={consequenceDialog.open}
				kind={consequenceDialog.kind}
				onConfirm={handleConsequenceConfirm}
				onCancel={() => setConsequenceDialog((prev) => ({ ...prev, open: false }))}
			/>

			{/* L14: Appetite adjust dialog */}
			<AppetiteDialog
				open={appetiteDialogOpen}
				currentAppetite={formatMoney(bet.costAppetite)}
				onConfirm={handleAppetiteConfirm}
				onCancel={() => setAppetiteDialogOpen(false)}
			/>

			{/* Q2: Add knowledge dialog — locked to bet scope */}
			<KnowledgeCreateDialog
				open={addKnowledgeOpen}
				onClose={() => setAddKnowledgeOpen(false)}
				onCreated={() => setAddKnowledgeOpen(false)}
				lockedScopeKind="bet"
				lockedScopeId={bet.id}
			/>

			{(bet.costActual != null || bet.tokensActual != null) && (
				<section
					aria-label="Bet cost"
					data-testid="bet-cost-section"
					className="rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[var(--density-card-pad)]"
				>
					<h2 className="text-xs font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
						Cost
					</h2>
					<div className="flex flex-col gap-1">
						{bet.costActual != null && (
							<KeyValue label="Spend" value={formatMoney(bet.costActual)} />
						)}
						{bet.tokensActual != null &&
							(() => {
								const totals = totalTokens(bet.tokensActual);
								const total = totals.prompt + totals.completion;
								return <KeyValue label="Tokens" value={formatTokenCount(total)} />;
							})()}
					</div>
				</section>
			)}

			{/* T3: Conditional rendering based on bet status mutability.
			    - Mutable (draft, active): BodyEditor with auto-save + saving indicator.
			    - Immutable (completed, killed): BetPitch (read-only blocks + block actions).
			    @lore T3: No Edit/Done toggle. BodyEditor is always mounted for mutable bets.
			    Block actions are only available in immutable statuses.
			    T4: onShareBlock added to BetPitch for attaching blocks as CoC context refs. */}
			{canEditDescription ? (
				<div className="flex flex-col gap-2" data-testid="bet-description-editor">
					<BodyEditor
						initialContent={bet.description}
						onChange={handleDescriptionChange}
						placeholder="Describe this bet..."
						variant="full"
						minHeight="200px"
					/>
					<span
						className="text-xs text-[var(--text-tertiary)]"
						aria-live="polite"
						data-testid="bet-save-indicator"
					>
						{saveStatus === "saving" && "Saving..."}
						{saveStatus === "saved" && "Saved"}
						{saveStatus === "error" && (
							<span className="text-[var(--status-error)]">Save failed</span>
						)}
					</span>
				</div>
			) : (
				<>
					{/* L18: Block popover wiring — onOpenBlockActions opens the page-level
					    block actions popover. The popover's "Discuss" item then calls
					    handleDiscussBlock. messagesByBlockId flows anchored messages inline
					    after each block's payload. */}
					<BetPitch
						description={bet.description}
						betId={bet.id}
						onOpenBlockActions={(blockId) => setOpenBlockId(blockId)}
						messagesByBlockId={messagesByBlockId}
						onShareBlock={handleShareBlock}
					/>
				</>
			)}

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

			<h2 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
				Tasks
			</h2>

			{bet.tasks.length === 0 ? (
				<EmptyState
					title="No tasks yet"
					description="Tasks will appear here once agents start work on this bet."
					dataTestId="bet-tasks-empty"
				/>
			) : (
				<div className="overflow-x-auto">
					<table className="table table-xs">
						<thead>
							<tr>
								<SortableHeader
									column="title"
									label="Title"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortableHeader
									column="status"
									label="Status"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								{/* L19: Outcome column — sortable, between Status and Owner */}
								<SortableHeader
									column="outcome"
									label="Outcome"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortableHeader
									column="owner"
									label="Owner"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								<SortableHeader
									column="costActual"
									label="Cost"
									sortColumn={sortColumn}
									sortDirection={sortDirection}
									onSort={handleSort}
								/>
								{/* L19: Session column — non-sortable, contains jump-out link */}
								<th scope="col">
									<span className="uppercase font-heading text-xs tracking-wider text-[var(--text-tertiary)]">
										Session
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{sortedTasks.map((task) => (
								// @lore L13: tr keeps its default table-row role so getAllByRole("cell")
								// continues to work on td elements. Keyboard accessibility is handled
								// via tabIndex + onKeyDown without overriding the role.
								<tr
									key={task.id}
									data-testid="bet-task-row"
									className="cursor-pointer hover:bg-[var(--surface-container)]"
									onClick={() => setSelectedTaskId(task.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											setSelectedTaskId(task.id);
										}
									}}
									tabIndex={0}
								>
									<td>{task.title}</td>
									<td>
										<StatusChip status={taskStateToStatus(task.state)} />
									</td>
									{/* L19: Outcome chip — renders when a session outcome exists */}
									<td>
										{task.latestSessionOutcome != null ? (
											<StatusChip status={sessionOutcomeToStatus(task.latestSessionOutcome)} />
										) : null}
									</td>
									<td>{task.owner}</td>
									<td className="font-mono">{formatMoney(task.costActual)}</td>
									{/* L19: Jump-out link — only rendered for valid http/https URLs */}
									<td>
										{task.latestSessionHarnessUrl &&
										isValidHarnessUrl(task.latestSessionHarnessUrl) ? (
											<a
												href={task.latestSessionHarnessUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="font-mono text-xs text-[var(--accent-primary)] hover:underline"
												aria-label="Open session in harness (opens in new tab)"
												onClick={(e) => e.stopPropagation()}
											>
												Open in harness
											</a>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

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

			{/* L13: TaskSheet — opens when a task row is clicked */}
			<TaskSheet
				task={selectedTask}
				open={selectedTaskId !== null}
				onClose={() => setSelectedTaskId(null)}
				resolveThreadId={handleResolveThreadId}
				postRequest={handlePostRequest}
				onNavigateToThread={handleNavigateToThread}
			/>
		</div>
	);
}

function SortableHeader({
	column,
	label,
	sortColumn,
	sortDirection,
	onSort,
}: {
	column: SortColumn;
	label: string;
	sortColumn: SortColumn | null;
	sortDirection: SortDirection;
	onSort: (column: SortColumn) => void;
}): JSX.Element {
	const active = sortColumn === column;
	const ariaSort: "none" | "ascending" | "descending" = active
		? sortDirection === "asc"
			? "ascending"
			: "descending"
		: "none";
	return (
		<th aria-sort={ariaSort} scope="col">
			<button
				type="button"
				className="flex items-center gap-1 uppercase font-heading text-xs tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
				onClick={() => onSort(column)}
			>
				<span>{label}</span>
				<span aria-hidden>{active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}</span>
			</button>
		</th>
	);
}
