// AL1 #7 — ReviewCodeDiff: the code-diff review canvas (the must-win family —
// AI tooling is strongest in code, so this one has to be excellent).
//
// Three-layer drill-down (the locked AL1 language):
//   L1  PR header  — title + GitHub logo + +140/−31 + CI checks row + Collapse all
//   L2  the proof  — RELEVANCE-RANKED file cards (logic → tests → generated collapsed),
//                    each a collapsible card with a +/− change badge + reviewed checkbox
//   L3  on demand  — expand a file → hunks with a line-number gutter + hover inline-
//                    comment "+" affordance. Reuses CodeRenderer's add/del/ctx tints.
//
// Presentational isolation: local useState for collapse-all + per-file expand; every
// callback is a no-op. No router/context. The story renders L1+L2 with the top file
// expanded to L3 so the full drill-down is visible in a single screenshot.

import type { CodeDelta, DiffLineRef } from "@hyperidle/design-system";
import { CodeDeltaRenderer } from "@hyperidle/design-system";
import type { AnchorRef } from "@hyperidle/domain-model";
import type { JSX, ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject } from "./payload-guard";
import type { CodeDiffPayload, ReviewCanvasProps } from "./review-artifact";
import {
	AnchoredThreadCard,
	InlineComposer,
	lineBlockId,
	useReviewAnchors,
} from "./review-canvas.js";

// ── diff line model (mirrors CodeRenderer's kind vocabulary: add/del/ctx) ─────────
type LineKind = "add" | "del" | "ctx";

interface DiffLine {
	readonly kind: LineKind;
	/** old-file line number (blank on pure additions). */
	readonly oldNo: number | null;
	/** new-file line number (blank on pure deletions). */
	readonly newNo: number | null;
	readonly text: string;
	/** AL4: deterministic block id for this line (computed if omitted). */
	readonly blockId?: import("@hyperidle/domain-model").BlockId;
	/** AL4: human-readable spot label, e.g. `PromoField.tsx:118`. */
	readonly spotLabel?: string;
}

interface Hunk {
	readonly header: string; // e.g. "@@ -118,7 +118,12 @@ async function onPromoApplied()"
	readonly lines: readonly DiffLine[];
}

interface ChangedFile {
	readonly path: string;
	readonly added: number;
	readonly removed: number;
	/** relevance band — drives ordering and the band label, never file/alpha order. */
	readonly band: "logic" | "test";
	readonly reviewed: boolean;
	/**
	 * one-line "why this matters" lead, shown above the hunks on LOGIC-band files
	 * only — why it's ranked here / what to look at. Omitted on tests + trivia.
	 */
	readonly rationale?: string;
	readonly hunks: readonly Hunk[];
}

interface CiCheck {
	readonly label: string;
	/** success cells show a ✓; the coverage delta carries its own text. */
	readonly detail?: string;
}

// ── fixture — GitHub PR, the expired-promo silent-success → typed-422 fix ─────────
// Realistic: the meat (catch → typed 422) is 6 lines inside a 12-file PR; generated
// churn (OpenAPI regen + lockfile + formatting) is collapsed to one trivia row.
const PROMO_WEBHOOK_HUNK: Hunk = {
	header: "@@ -116,9 +116,18 @@ export async function onPromoApplied(evt: PromoEvent) {",
	lines: [
		{ kind: "ctx", oldNo: 116, newNo: 116, text: "  const promo = await promos.find(evt.code);" },
		{ kind: "ctx", oldNo: 117, newNo: 117, text: "  if (!promo) return notFound(evt.code);" },
		{ kind: "del", oldNo: 118, newNo: null, text: "  if (promo.expiresAt < now()) {" },
		{
			kind: "del",
			oldNo: 119,
			newNo: null,
			text: "    // expired — nothing to apply, ack the webhook",
		},
		{ kind: "del", oldNo: 120, newNo: null, text: "    return ack(evt);" },
		{ kind: "del", oldNo: 121, newNo: null, text: "  }" },
		{ kind: "add", oldNo: null, newNo: 118, text: "  if (promo.expiresAt < now()) {" },
		{ kind: "add", oldNo: null, newNo: 119, text: "    return fail(evt, {" },
		{ kind: "add", oldNo: null, newNo: 120, text: "      status: 422," },
		{ kind: "add", oldNo: null, newNo: 121, text: '      code: "promo_expired",' },
		{ kind: "add", oldNo: null, newNo: 122, text: "      expiredAt: promo.expiresAt," },
		{ kind: "add", oldNo: null, newNo: 123, text: "    });" },
		{ kind: "add", oldNo: null, newNo: 124, text: "  }" },
		{ kind: "ctx", oldNo: 122, newNo: 125, text: "  return applyDiscount(evt, promo);" },
		{ kind: "ctx", oldNo: 123, newNo: 126, text: "}" },
	],
};

const PROMO_FIELD_HUNK: Hunk = {
	header: "@@ -41,5 +41,9 @@ function PromoField({ onApply }: PromoFieldProps) {",
	lines: [
		{ kind: "ctx", oldNo: 41, newNo: 41, text: "  const res = await applyPromo(code);" },
		{ kind: "del", oldNo: 42, newNo: null, text: '  if (res.ok) toast.success("Promo applied");' },
		{
			kind: "add",
			oldNo: null,
			newNo: 42,
			text: '  if (res.ok) { toast.success("Promo applied"); return; }',
		},
		{ kind: "add", oldNo: null, newNo: 43, text: '  if (res.code === "promo_expired")' },
		{
			kind: "add",
			oldNo: null,
			newNo: 44,
			// biome-ignore lint/suspicious/noTemplateCurlyInString: reproduces a source-code template literal in the diff fixture.
			text: "    setError(`This promo expired on ${fmt(res.expiredAt)}.`);",
		},
		{ kind: "ctx", oldNo: 43, newNo: 45, text: '  else setError("Couldn’t apply that code.");' },
	],
};

const PROMO_TEST_HUNK: Hunk = {
	header: "@@ -0,0 +1,44 @@ // new file",
	lines: [
		{
			kind: "add",
			oldNo: null,
			newNo: 1,
			text: 'test("expired promo returns typed 422, not silent ack", async () => {',
		},
		{
			kind: "add",
			oldNo: null,
			newNo: 2,
			text: "  const promo = seedPromo({ expiresAt: yesterday });",
		},
		{
			kind: "add",
			oldNo: null,
			newNo: 3,
			text: "  const res = await onPromoApplied(eventFor(promo));",
		},
		{ kind: "add", oldNo: null, newNo: 4, text: "  expect(res.status).toBe(422);" },
		{ kind: "add", oldNo: null, newNo: 5, text: '  expect(res.code).toBe("promo_expired");' },
		{ kind: "add", oldNo: null, newNo: 6, text: "});" },
	],
};

const FILES: readonly ChangedFile[] = [
	{
		path: "src/billing/promo-webhook.ts",
		added: 28,
		removed: 6,
		band: "logic",
		reviewed: false,
		rationale: "The fix — rethrows the typed error instead of swallowing it (the behavior change).",
		hunks: [PROMO_WEBHOOK_HUNK],
	},
	{
		path: "src/checkout/PromoField.tsx",
		added: 19,
		removed: 2,
		band: "logic",
		reviewed: false,
		rationale: "Renders the new user-facing “expired” message.",
		hunks: [PROMO_FIELD_HUNK],
	},
	{
		path: "src/billing/__tests__/promo.expired.test.ts",
		added: 44,
		removed: 0,
		band: "test",
		reviewed: true,
		hunks: [PROMO_TEST_HUNK],
	},
];

// Generated / trivia — never shown line-by-line; collapsed to one row.
const TRIVIA = {
	count: 3,
	summary: "OpenAPI regen + lockfile + formatting",
	added: 49,
	removed: 23,
} as const;

// The agent's plain-language change summary — the PR/ship description. Reads as prose,
// not code (founder asked for a "little PR message" up top, distinct from the diff).
const PR_DESCRIPTION =
	"Root cause: an unhandled PromoExpiredError was swallowed by a catch-all, so expired codes silently “succeeded.” Now returns a typed 422 and checkout renders an inline “This code expired on Apr 3” message. Regression test added.";

const CI_CHECKS: readonly CiCheck[] = [
	{ label: "tests" },
	{ label: "lint" },
	{ label: "build" },
	{ label: "typecheck" },
];

interface CodeDiffData {
	readonly title: string;
	readonly description: string;
	readonly files: readonly ChangedFile[];
	readonly trivia: {
		readonly count: number;
		readonly summary: string;
		readonly added: number;
		readonly removed: number;
	};
	readonly checks: readonly CiCheck[];
}

const CODE_DIFF_FIXTURE: CodeDiffData = {
	title: "Fix expired-promo checkout returns silent success → typed 422",
	description: PR_DESCRIPTION,
	files: FILES,
	trivia: TRIVIA,
	checks: CI_CHECKS,
};

const BAND_LABEL: Record<ChangedFile["band"], string> = {
	logic: "Logic",
	test: "Tests",
};

// ── small presentational atoms ───────────────────────────────────────────────────

/** the +N/−M change badge — tabular-nums so the digits never shift column. */
function ChangeBadge({ added, removed }: { added: number; removed: number }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-[6px] text-[12px] font-mono tabular-nums leading-none">
			<span className="text-[var(--status-success)] font-[600]">+{added}</span>
			<span className="text-[var(--status-error)] font-[600]">−{removed}</span>
		</span>
	);
}

function Chevron({ open }: { open: boolean }): JSX.Element {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 12 12"
			className="h-[12px] w-[12px] shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--motion-fast)] ease-[var(--motion-ease)]"
			style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
		>
			<path
				d="M4 2.5 L8 6 L4 9.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CheckGlyph(): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[11px] w-[11px]">
			<path
				d="M2.5 6.2 L5 8.5 L9.5 3.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** reviewed checkbox — a no-op toggle, styled to Hearth (accent fill when on). */
function ReviewedBox({
	reviewed,
	onToggle,
}: {
	reviewed: boolean;
	onToggle: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			aria-pressed={reviewed}
			title={reviewed ? "Reviewed" : "Mark reviewed"}
			// This is a compact 18x18 icon-only reviewed-indicator inside a dense
			// code-diff row. It is functionally a Checkbox (AZ7 Set 2), but
			// Checkbox.tsx's visible label is mandatory and would break this
			// row's density; it is not a Button (not an action). Candidate for a
			// Checkbox icon-only variant per design-system.md's promotion rule
			// if a second consumer needs the same shape.
			className={[
				"inline-flex h-[18px] w-[18px] items-center justify-center rounded-[var(--r-subtle)] border-[1.5px] shrink-0",
				"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				reviewed
					? // eslint-disable-next-line design/no-handrolled-control -- see comment above className
						"bg-[var(--accent-primary)] border-[var(--accent-primary)] text-[var(--text-on-accent)]"
					: "bg-[var(--surface-elevated)] border-[var(--border-default)] text-transparent",
			].join(" ")}
		>
			<CheckGlyph />
		</button>
	);
}

// ── L1: CI checks row ─────────────────────────────────────────────────────────────
function CiRow({ checks }: { readonly checks: readonly CiCheck[] }): JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-[9px]">
			<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] px-[9px] py-[3px] text-[12px] font-[600] text-[var(--status-success)]">
				<CheckGlyph />
				All checks passed
			</span>
			<div className="flex flex-wrap items-center gap-x-[12px] gap-y-[3px]">
				{checks.map((c) => (
					<span
						key={c.label}
						className="inline-flex items-center gap-[4px] text-[12px] text-[var(--text-secondary)]"
					>
						<span className="text-[var(--status-success)]">
							<CheckGlyph />
						</span>
						{c.label}
					</span>
				))}
				<span className="inline-flex items-center gap-[4px] text-[12px] text-[var(--text-secondary)]">
					<span className="text-[var(--status-success)]">
						<CheckGlyph />
					</span>
					coverage
					<span className="font-mono tabular-nums font-[600] text-[var(--status-success)]">
						+0.4%
					</span>
				</span>
			</div>
		</div>
	);
}

// ── helpers to build a CodeDelta from the review's Hunk type ─────────────────────

/** Convert the review Hunk model to a DS CodeDelta (thread oldNo/newNo through). */
function toDelta(filePath: string, hunks: readonly Hunk[]): CodeDelta {
	return {
		file: filePath,
		hunks: hunks.map((h) => ({
			header: h.header,
			lines: h.lines.map((l) => ({
				kind: l.kind,
				text: l.text,
				oldNo: l.oldNo,
				newNo: l.newNo,
			})),
		})),
	};
}

/** Build a stable key for a (hunkIndex, lineIndex) pair used inside FileDiff. */
function lineKey(hunkIndex: number, lineIndex: number): string {
	return `${hunkIndex}:${lineIndex}`;
}

// ── L3: a single file's hunks with a line-number gutter ───────────────────────────
//
// @lore AM5 C1: FileDiff now composes the DS CodeDeltaRenderer (K2b) via the
// four per-line slot callbacks (renderLineGutter / renderLineAffordance /
// renderLineBelow / renderTrailing). The DS core owns the hunk/line structure
// (hunk headers, data-diff-type, prefix glyph, <code> text, line bg tints);
// the review chrome fills the slots with its dual gutter, "+" button,
// InlineComposer, AnchoredThreadCard, and orphan pass.
// The rendered DOM is byte-identical to the previous hand-rolled version.
function FileDiff({
	hunks,
	filePath,
	artifactId,
	anchors,
	readOnly,
	onAddAnchor,
}: {
	readonly hunks: readonly Hunk[];
	readonly filePath: string;
	readonly artifactId: string;
	readonly anchors: ReadonlyArray<import("./review-composition.js").ReviewComment>;
	readonly readOnly: boolean;
	readonly onAddAnchor: (input: { anchor: AnchorRef; text: string }) => Promise<void>;
}): JSX.Element {
	const [composerBlockId, setComposerBlockId] = useState<
		import("@hyperidle/domain-model").BlockId | null
	>(null);

	// ── pre-compute anchor info per (hunkIndex, lineIndex) ────────────────────
	// This avoids re-deriving block ids inside every slot call (which would
	// recompute inside render-time callbacks with no stable reference).
	type LineInfo = {
		readonly blockId: import("@hyperidle/domain-model").BlockId;
		readonly anchor: AnchorRef;
	};
	const lineInfoMap = useMemo(() => {
		const map = new Map<string, LineInfo>();
		hunks.forEach((hunk, hunkIndex) => {
			hunk.lines.forEach((line, lineIndex) => {
				const blockId = line.blockId ?? lineBlockId(artifactId, filePath, hunkIndex, line);
				const spotLabel = line.spotLabel ?? `${filePath}:${line.newNo ?? line.oldNo ?? "new"}`;
				map.set(lineKey(hunkIndex, lineIndex), {
					blockId,
					anchor: { artifactId, blockId, spotLabel },
				});
			});
		});
		return map;
	}, [hunks, artifactId, filePath]);

	const threadMap = useMemo(() => {
		const map = new Map<string, import("./review-composition.js").ReviewComment[]>();
		for (const c of anchors) {
			if (!c.anchor) continue;
			const key = c.anchor.blockId;
			const list = map.get(key) ?? [];
			list.push(c);
			map.set(key, list);
		}
		return map;
	}, [anchors]);

	// Track all block ids that appear in the current diff for orphan detection.
	const allBlockIds = useMemo(() => {
		const s = new Set<string>();
		for (const info of lineInfoMap.values()) s.add(info.blockId);
		return s;
	}, [lineInfoMap]);

	// ── slot: dual line-number gutter (old | new) ─────────────────────────────
	const renderLineGutter = (ref: DiffLineRef): ReactNode => (
		<>
			<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums">
				{ref.oldNo ?? ""}
			</span>
			<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums border-r border-[var(--border-subtle)]">
				{ref.newNo ?? ""}
			</span>
		</>
	);

	// ── slot: inline-comment "+" affordance ───────────────────────────────────
	const renderLineAffordance = (ref: DiffLineRef): ReactNode => {
		if (readOnly) return null;
		const info = lineInfoMap.get(lineKey(ref.hunkIndex, ref.lineIndex));
		if (!info) return null;
		return (
			<button
				type="button"
				aria-label="Add inline comment"
				title="Add inline comment"
				onClick={() => setComposerBlockId(info.blockId)}
				className="absolute left-[68px] top-1/2 hidden h-[16px] w-[16px] -translate-y-1/2 items-center justify-center rounded-[var(--r-subtle)] bg-[var(--accent-primary)] text-[var(--text-on-accent)] text-[12px] leading-none group-hover/line:flex focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-deep)]"
			>
				+
			</button>
		);
	};

	// ── slot: InlineComposer + AnchoredThreadCard below the line ─────────────
	const renderLineBelow = (ref: DiffLineRef): ReactNode => {
		const info = lineInfoMap.get(lineKey(ref.hunkIndex, ref.lineIndex));
		if (!info) return null;
		const { anchor } = info;
		const threadComments = threadMap.get(info.blockId) ?? [];
		const composerOpen = composerBlockId === info.blockId;
		return (
			<Fragment key={`below:${ref.hunkIndex}:${ref.lineIndex}`}>
				{composerOpen ? (
					<div className="flex gap-[12px] pl-[88px] pr-[12px] py-[9px]">
						<div className="flex flex-col items-center gap-0">
							<div className="w-[var(--bw-default)] h-[18px] bg-[var(--border-strong)]" />
							<div className="w-[6px] h-[6px] rounded-[var(--r-pill)] bg-[var(--accent-primary)]" />
							<div className="w-[var(--bw-default)] flex-1 bg-[var(--border-strong)]" />
						</div>
						<InlineComposer
							anchor={anchor}
							onSubmit={async (text: string) => {
								await onAddAnchor({ anchor, text });
								setComposerBlockId(null);
							}}
						/>
					</div>
				) : null}
				{threadComments.length > 0 ? (
					<div className="pl-[88px] pr-[12px] py-[9px]">
						<AnchoredThreadCard
							anchor={anchor}
							comments={threadComments}
							readOnly={readOnly}
							onReply={async (text: string) => {
								await onAddAnchor({ anchor, text });
							}}
						/>
					</div>
				) : null}
			</Fragment>
		);
	};

	// ── slot: orphaned anchors after all hunks ────────────────────────────────
	const renderTrailing = (): ReactNode =>
		Array.from(threadMap.entries())
			.filter(([blockId]) => !allBlockIds.has(blockId))
			.map(([blockId, comments]) => {
				const first = comments[0];
				if (!first?.anchor) return null;
				return (
					<div key={blockId} className="px-[12px] py-[9px] opacity-60">
						<AnchoredThreadCard
							anchor={first.anchor}
							comments={comments}
							readOnly={readOnly}
							orphan
						/>
					</div>
				);
			});

	const delta = toDelta(filePath, hunks);

	return (
		<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-container)]">
			<CodeDeltaRenderer
				delta={delta}
				renderLineGutter={renderLineGutter}
				renderLineAffordance={renderLineAffordance}
				renderLineBelow={renderLineBelow}
				renderTrailing={renderTrailing}
			/>
		</div>
	);
}

// ── L2: one relevance-ranked file card ────────────────────────────────────────────
function FileCard({
	file,
	open,
	onToggleOpen,
	onToggleReviewed,
	showBand,
	artifactId,
	anchors,
	readOnly,
	onAddAnchor,
}: {
	readonly file: ChangedFile;
	readonly open: boolean;
	readonly onToggleOpen: () => void;
	readonly onToggleReviewed: () => void;
	readonly showBand: boolean;
	readonly artifactId: string;
	readonly anchors: ReadonlyArray<import("./review-composition.js").ReviewComment>;
	readonly readOnly: boolean;
	readonly onAddAnchor: (input: { anchor: AnchorRef; text: string }) => Promise<void>;
}): JSX.Element {
	const dir = file.path.slice(0, file.path.lastIndexOf("/") + 1);
	const name = file.path.slice(file.path.lastIndexOf("/") + 1);
	return (
		<div className="overflow-hidden rounded-[var(--r-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
			{showBand ? (
				<div className="px-[12px] pt-[9px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
					{BAND_LABEL[file.band]}
				</div>
			) : null}
			{/* div-as-button: a real <button> here would nest the ReviewedBox button (invalid DOM). */}
			{/* biome-ignore lint/a11y/useSemanticElements: nesting a focusable ReviewedBox inside the row button is invalid DOM; role/button is intentional. */}
			<div
				role="button"
				tabIndex={0}
				onClick={onToggleOpen}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onToggleOpen();
					}
				}}
				className="flex w-full cursor-pointer items-center gap-[9px] px-[12px] py-[9px] text-left"
			>
				<Chevron open={open} />
				<span className="min-w-0 flex-1 truncate font-mono text-[13px] text-[var(--text-primary)]">
					<span className="text-[var(--text-tertiary)]">{dir}</span>
					<span className="font-[600]">{name}</span>
				</span>
				<ChangeBadge added={file.added} removed={file.removed} />
				<ReviewedBox reviewed={file.reviewed} onToggle={onToggleReviewed} />
			</div>
			{/* "why this matters" lead — tertiary prose above the hunks, distinct from code. */}
			{open && file.rationale ? (
				<p className="border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-[12px] py-[9px] text-[12px] leading-[1.45] text-[var(--text-tertiary)]">
					{file.rationale}
				</p>
			) : null}
			{open ? (
				<FileDiff
					hunks={file.hunks}
					filePath={file.path}
					artifactId={artifactId}
					anchors={anchors}
					readOnly={readOnly}
					onAddAnchor={onAddAnchor}
				/>
			) : null}
		</div>
	);
}

// ── the canvas ────────────────────────────────────────────────────────────────────
export interface ReviewCodeDiffProps {
	/** start with the top (most-relevant) file expanded so L3 shows by default. */
	readonly initialExpandedPath?: string;
	/** AL4: raw payload so the canvas can compute deterministic line block ids. */
	readonly payload?: unknown;
	/** AL4: owning artifact id for deterministic line block ids. */
	readonly artifactId?: string;
}

function ReviewCodeDiffView({
	initialExpandedPath = CODE_DIFF_FIXTURE.files[0]?.path,
	payload,
	artifactId = "artifact:code:fixture",
}: ReviewCodeDiffProps): JSX.Element {
	const data = mapCodeDiffPayload(payload ?? CODE_DIFF_FIXTURE, artifactId);
	const { description, files, trivia, checks } = data;
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(initialExpandedPath ? [initialExpandedPath] : []),
	);
	const [reviewed, setReviewed] = useState<ReadonlySet<string>>(
		() => new Set(files.filter((f) => f.reviewed).map((f) => f.path)),
	);
	const [triviaOpen, setTriviaOpen] = useState(false);

	const { anchors: allAnchors, readOnly, onAddAnchor } = useReviewAnchors();
	const anchors = useMemo(
		() => allAnchors.filter((c) => c.anchor?.artifactId === artifactId),
		[allAnchors, artifactId],
	);

	const allCollapsed = expanded.size === 0 && !triviaOpen;

	function toggleExpanded(path: string): void {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}
	function toggleReviewed(path: string): void {
		setReviewed((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}
	function collapseOrExpandAll(): void {
		if (allCollapsed) {
			setExpanded(new Set(files.map((f) => f.path)));
			setTriviaOpen(true);
		} else {
			setExpanded(new Set());
			setTriviaOpen(false);
		}
	}

	const totalAdded = files.reduce((s, f) => s + f.added, 0) + trivia.added;
	const totalRemoved = files.reduce((s, f) => s + f.removed, 0) + trivia.removed;

	// relevance order: logic band first, then test band — never file/alpha order.
	const ordered = [...files].sort((a, b) => (a.band === b.band ? 0 : a.band === "logic" ? -1 : 1));

	return (
		<section
			aria-label="Code diff review"
			className="w-full max-w-[860px] overflow-hidden rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-page)] shadow-[var(--shadow-default)]"
		>
			{/* ── L1: PR header ───────────────────────────────────────────────── */}
			<header className="flex flex-col gap-[12px] p-[18px]">
				<div className="flex items-start gap-[12px]">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-[9px] text-[12px] text-[var(--text-tertiary)]">
							<span className="inline-flex items-center gap-[4px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] px-[9px] py-[2px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--status-success)]">
								Open
							</span>
						</div>
					</div>
					<div className="shrink-0 pt-[2px]">
						<ChangeBadge added={totalAdded} removed={totalRemoved} />
					</div>
				</div>

				{/* PR / ship message — the agent's plain-language summary, prose not code. */}
				<p className="max-w-[68ch] text-[13px] leading-[1.55] text-[var(--text-secondary)]">
					{description}
				</p>

				<CiRow checks={checks} />

				<div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-[12px]">
					<span className="text-[12px] text-[var(--text-secondary)]">
						<span className="font-mono tabular-nums font-[600] text-[var(--text-primary)]">
							{files.length + trivia.count}
						</span>{" "}
						files changed · relevance-ranked
					</span>
					<button
						type="button"
						onClick={collapseOrExpandAll}
						className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)]"
					>
						{allCollapsed ? "Expand" : "Collapse"} {files.length + trivia.count} files changed
					</button>
				</div>
			</header>

			{/* ── L2: relevance-ranked file cards (logic → tests → generated) ──── */}
			<div className="flex flex-col gap-[9px] px-[18px] pb-[18px]">
				{ordered.map((file, i) => {
					const prev = ordered[i - 1];
					const showBand = !prev || prev.band !== file.band;
					return (
						<FileCard
							key={file.path}
							file={{ ...file, reviewed: reviewed.has(file.path) }}
							open={expanded.has(file.path)}
							onToggleOpen={() => toggleExpanded(file.path)}
							onToggleReviewed={() => toggleReviewed(file.path)}
							showBand={showBand}
							artifactId={artifactId}
							anchors={anchors}
							readOnly={readOnly}
							onAddAnchor={onAddAnchor}
						/>
					);
				})}

				{/* MINOR band — the separation header + note so the user knows these don't need review */}
				<div className="mt-[3px] flex items-baseline gap-[6px] px-[12px] pt-[6px]">
					<span className="text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]">
						Minor
					</span>
					<span className="text-[11px] text-[var(--text-tertiary)]">
						generated &amp; formatting — safe to skip
					</span>
				</div>
				{/* generated / trivia — collapsed to one row, never line-by-line */}
				<div className="rounded-[var(--r-subtle)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-container)]">
					<button
						type="button"
						onClick={() => setTriviaOpen((v) => !v)}
						aria-expanded={triviaOpen}
						className="flex w-full items-center gap-[9px] px-[12px] py-[9px] text-left"
					>
						<Chevron open={triviaOpen} />
						<span className="flex-1 text-[13px] text-[var(--text-secondary)]">
							<span className="font-mono tabular-nums font-[600] text-[var(--text-primary)]">
								{trivia.count}
							</span>{" "}
							files · {trivia.summary}
						</span>
						<ChangeBadge added={trivia.added} removed={trivia.removed} />
					</button>
					{triviaOpen ? (
						<div className="border-t border-[var(--border-subtle)] px-[12px] py-[9px] font-mono text-[12px] text-[var(--text-tertiary)]">
							<div>openapi/schema.gen.ts</div>
							<div>package-lock.json</div>
							<div>src/checkout/styles.css</div>
						</div>
					) : null}
				</div>
			</div>

			{/*
			  States (populated shown above):
			  - empty:   no changed files → "No file changes in this PR." (CI row still shown).
			  - loading: 3 skeleton file-card rows (shimmer on opacity only) under the header.
			  - error:   "Couldn't load the diff from GitHub." + Retry pill.
			  - needs-you emphasis: a file with an unresolved review thread gets a
			    --status-warning left rule + a "1 thread" chip in its card header.
			*/}
		</section>
	);
}

// AL2 — review artifact wrapper.
function isCodeDiffPayload(payload: unknown): payload is CodeDiffPayload {
	return (
		isPlainObject(payload) &&
		typeof payload.prTitle === "string" &&
		typeof payload.description === "string" &&
		Array.isArray(payload.checks) &&
		Array.isArray(payload.files)
	);
}

function mapCodeDiffPayload(payload: unknown, artifactId?: string): CodeDiffData {
	if (!isCodeDiffPayload(payload)) return CODE_DIFF_FIXTURE;

	const trivia = isPlainObject(payload.trivia)
		? {
				count: Number(payload.trivia.count) || 0,
				summary: String(payload.trivia.summary ?? payload.triviaSummary ?? ""),
				added: Number(payload.trivia.added) || 0,
				removed: Number(payload.trivia.removed) || 0,
			}
		: { count: 0, summary: payload.triviaSummary, added: 0, removed: 0 };

	return {
		title: payload.prTitle,
		description: payload.description,
		files: payload.files.map((file, fileIndex) => ({
			path: file.path,
			added: Number(file.added) || 0,
			removed: Number(file.removed) || 0,
			band: file.band === "test" ? ("test" as const) : ("logic" as const),
			reviewed: false,
			rationale: typeof file.rationale === "string" ? file.rationale : undefined,
			hunks: (file.hunks ?? []).map((hunk, hunkIndex) => ({
				header: hunk.header,
				lines: hunk.lines.map((line) => {
					const spotLabel = `${file.path}:${line.newNo ?? line.oldNo ?? "new"}`;
					return {
						...line,
						blockId: lineBlockId(
							artifactId ?? `artifact:code:${fileIndex}`,
							file.path,
							hunkIndex,
							line,
						),
						spotLabel,
					};
				}),
			})),
		})),
		trivia,
		checks: payload.checks.map((label) => ({ label: String(label) })),
	};
}

export function ReviewCodeDiff({ artifact }: ReviewCanvasProps): JSX.Element {
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewCodeDiffView payload={artifact.payload} artifactId={artifact.id} />
		</div>
	);
}
