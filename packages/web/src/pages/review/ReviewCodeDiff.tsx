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

import { type JSX, useState } from "react";
import { ToolLogo } from "./ToolLogo";

// ── diff line model (mirrors CodeRenderer's kind vocabulary: add/del/ctx) ─────────
type LineKind = "add" | "del" | "ctx";

interface DiffLine {
	readonly kind: LineKind;
	/** old-file line number (blank on pure additions). */
	readonly oldNo: number | null;
	/** new-file line number (blank on pure deletions). */
	readonly newNo: number | null;
	readonly text: string;
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
	readonly hunks: readonly Hunk[];
}

interface CiCheck {
	readonly label: string;
	/** success cells show a ✓; the coverage delta carries its own text. */
	readonly detail?: string;
}

// @lore AL1: reuse CodeRenderer's exact diff tints (AI6) so the code canvas and any
// inline artifact diff render identically. add = success 10%, del = error 10%.
const LINE_TINT: Record<LineKind, string> = {
	add: "bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]",
	del: "bg-[color-mix(in_oklab,var(--status-error)_10%,transparent)]",
	ctx: "",
};

const LINE_PREFIX: Record<LineKind, string> = { add: "+", del: "-", ctx: " " };

// ── fixture — GitHub PR, the expired-promo silent-success → typed-422 fix ─────────
// Realistic: the meat (catch → typed 422) is 6 lines inside a 12-file PR; generated
// churn (OpenAPI regen + lockfile + formatting) is collapsed to one trivia row.
const PROMO_WEBHOOK_HUNK: Hunk = {
	header: "@@ -116,9 +116,18 @@ export async function onPromoApplied(evt: PromoEvent) {",
	lines: [
		{ kind: "ctx", oldNo: 116, newNo: 116, text: "  const promo = await promos.find(evt.code);" },
		{ kind: "ctx", oldNo: 117, newNo: 117, text: "  if (!promo) return notFound(evt.code);" },
		{ kind: "del", oldNo: 118, newNo: null, text: "  if (promo.expiresAt < now()) {" },
		{ kind: "del", oldNo: 119, newNo: null, text: "    // expired — nothing to apply, ack the webhook" },
		{ kind: "del", oldNo: 120, newNo: null, text: "    return ack(evt);" },
		{ kind: "del", oldNo: 121, newNo: null, text: "  }" },
		{ kind: "add", oldNo: null, newNo: 118, text: "  if (promo.expiresAt < now()) {" },
		{ kind: "add", oldNo: null, newNo: 119, text: "    return fail(evt, {" },
		{ kind: "add", oldNo: null, newNo: 120, text: '      status: 422,' },
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
		{ kind: "del", oldNo: 42, newNo: null, text: "  if (res.ok) toast.success(\"Promo applied\");" },
		{ kind: "add", oldNo: null, newNo: 42, text: "  if (res.ok) { toast.success(\"Promo applied\"); return; }" },
		{ kind: "add", oldNo: null, newNo: 43, text: '  if (res.code === "promo_expired")' },
		{ kind: "add", oldNo: null, newNo: 44, text: "    setError(`This promo expired on ${fmt(res.expiredAt)}.`);" },
		{ kind: "ctx", oldNo: 43, newNo: 45, text: "  else setError(\"Couldn’t apply that code.\");" },
	],
};

const PROMO_TEST_HUNK: Hunk = {
	header: "@@ -0,0 +1,44 @@ // new file",
	lines: [
		{ kind: "add", oldNo: null, newNo: 1, text: 'test("expired promo returns typed 422, not silent ack", async () => {' },
		{ kind: "add", oldNo: null, newNo: 2, text: "  const promo = seedPromo({ expiresAt: yesterday });" },
		{ kind: "add", oldNo: null, newNo: 3, text: "  const res = await onPromoApplied(eventFor(promo));" },
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
		hunks: [PROMO_WEBHOOK_HUNK],
	},
	{
		path: "src/checkout/PromoField.tsx",
		added: 19,
		removed: 2,
		band: "logic",
		reviewed: false,
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

const CI_CHECKS: readonly CiCheck[] = [
	{ label: "tests" },
	{ label: "lint" },
	{ label: "build" },
	{ label: "typecheck" },
];

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
			<path d="M4 2.5 L8 6 L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function CheckGlyph(): JSX.Element {
	return (
		<svg aria-hidden="true" viewBox="0 0 12 12" className="h-[11px] w-[11px]">
			<path d="M2.5 6.2 L5 8.5 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

/** reviewed checkbox — a no-op toggle, styled to Hearth (accent fill when on). */
function ReviewedBox({ reviewed, onToggle }: { reviewed: boolean; onToggle: () => void }): JSX.Element {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
			aria-pressed={reviewed}
			title={reviewed ? "Reviewed" : "Mark reviewed"}
			className={[
				"inline-flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border-[1.5px] shrink-0",
				"transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
				reviewed
					? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white"
					: "bg-[var(--surface-elevated)] border-[var(--border-default)] text-transparent",
			].join(" ")}
		>
			<CheckGlyph />
		</button>
	);
}

// ── L1: CI checks row ─────────────────────────────────────────────────────────────
function CiRow(): JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-[9px]">
			<span className="inline-flex items-center gap-[6px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] px-[9px] py-[3px] text-[12px] font-[600] text-[var(--status-success)]">
				<CheckGlyph />
				All checks passed
			</span>
			<div className="flex flex-wrap items-center gap-x-[12px] gap-y-[3px]">
				{CI_CHECKS.map((c) => (
					<span key={c.label} className="inline-flex items-center gap-[4px] text-[12px] text-[var(--text-secondary)]">
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
					<span className="font-mono tabular-nums font-[600] text-[var(--status-success)]">+0.4%</span>
				</span>
			</div>
		</div>
	);
}

// ── L3: a single file's hunks with a line-number gutter ───────────────────────────
function FileDiff({ hunks }: { hunks: readonly Hunk[] }): JSX.Element {
	return (
		<div className="border-t border-[var(--border-subtle)] bg-[var(--surface-container)]">
			{hunks.map((hunk) => (
				<div key={hunk.header}>
					<div className="px-[12px] py-[6px] font-mono text-[12px] text-[var(--text-tertiary)] bg-[color-mix(in_oklab,var(--accent-primary)_6%,transparent)] select-none">
						{hunk.header}
					</div>
					<div className="font-mono text-[12px] leading-[1.55]">
						{hunk.lines.map((line, li) => (
							<div
								key={`${hunk.header}-${li}`}
								data-diff-type={line.kind}
								className={`group/line relative flex ${LINE_TINT[line.kind]}`}
							>
								{/* line-number gutter — old | new, tabular so columns hold */}
								<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums">
									{line.oldNo ?? ""}
								</span>
								<span className="select-none w-[36px] shrink-0 px-[6px] text-right text-[var(--text-tertiary)] tabular-nums border-r border-[var(--border-subtle)]">
									{line.newNo ?? ""}
								</span>
								{/* hover inline-comment "+" affordance, anchored in the gutter seam */}
								<button
									type="button"
									aria-label="Add inline comment"
									title="Add inline comment"
									onClick={() => {}}
									className="absolute left-[68px] top-1/2 hidden h-[16px] w-[16px] -translate-y-1/2 items-center justify-center rounded-[6px] bg-[var(--accent-primary)] text-white text-[12px] leading-none group-hover/line:flex"
								>
									+
								</button>
								<span className="select-none w-[16px] shrink-0 px-[3px] text-center text-[var(--text-tertiary)]">
									{LINE_PREFIX[line.kind]}
								</span>
								<code className="flex-1 whitespace-pre pr-[12px] text-[var(--text-primary)]">{line.text}</code>
							</div>
						))}
					</div>
				</div>
			))}
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
}: {
	file: ChangedFile;
	open: boolean;
	onToggleOpen: () => void;
	onToggleReviewed: () => void;
	showBand: boolean;
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
			{open ? <FileDiff hunks={file.hunks} /> : null}
		</div>
	);
}

// ── the canvas ────────────────────────────────────────────────────────────────────
export interface ReviewCodeDiffProps {
	/** start with the top (most-relevant) file expanded so L3 shows by default. */
	readonly initialExpandedPath?: string;
}

export function ReviewCodeDiff({
	initialExpandedPath = FILES[0]?.path,
}: ReviewCodeDiffProps): JSX.Element {
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(
		() => new Set(initialExpandedPath ? [initialExpandedPath] : []),
	);
	const [reviewed, setReviewed] = useState<ReadonlySet<string>>(
		() => new Set(FILES.filter((f) => f.reviewed).map((f) => f.path)),
	);
	const [triviaOpen, setTriviaOpen] = useState(false);

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
			setExpanded(new Set(FILES.map((f) => f.path)));
			setTriviaOpen(true);
		} else {
			setExpanded(new Set());
			setTriviaOpen(false);
		}
	}

	const totalAdded = FILES.reduce((s, f) => s + f.added, 0) + TRIVIA.added;
	const totalRemoved = FILES.reduce((s, f) => s + f.removed, 0) + TRIVIA.removed;

	// relevance order: logic band first, then test band — never file/alpha order.
	const ordered = [...FILES].sort((a, b) => (a.band === b.band ? 0 : a.band === "logic" ? -1 : 1));

	return (
		<section
			aria-label="Code diff review"
			className="w-full max-w-[860px] rounded-[var(--r-default)] border border-[var(--border-subtle)] bg-[var(--surface-page)] p-[18px] shadow-[var(--shadow-default)]"
		>
			{/* ── L1: PR header ───────────────────────────────────────────────── */}
			<header className="flex flex-col gap-[12px]">
				<div className="flex items-start gap-[12px]">
					<div className="mt-[2px]">
						<ToolLogo tool="github" size="md" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-[9px] text-[12px] text-[var(--text-tertiary)]">
							<span className="font-[600] text-[var(--text-secondary)]">acme/storefront</span>
							<span>#1428</span>
							<span className="inline-flex items-center gap-[4px] rounded-[var(--r-pill)] bg-[color-mix(in_oklab,var(--status-success)_14%,transparent)] px-[9px] py-[2px] text-[10px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--status-success)]">
								Open
							</span>
						</div>
						<h2 className="mt-[3px] text-[17px] font-[600] leading-[1.3] text-[var(--text-primary)]">
							Fix expired-promo checkout returns silent success → typed 422
						</h2>
					</div>
					<div className="shrink-0 pt-[2px]">
						<ChangeBadge added={totalAdded} removed={totalRemoved} />
					</div>
				</div>

				<CiRow />

				<div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-[12px]">
					<span className="text-[12px] text-[var(--text-secondary)]">
						<span className="font-mono tabular-nums font-[600] text-[var(--text-primary)]">{FILES.length + TRIVIA.count}</span>{" "}
						files changed · relevance-ranked
					</span>
					<button
						type="button"
						onClick={collapseOrExpandAll}
						className="rounded-[var(--r-pill)] border border-[var(--border-default)] bg-[var(--surface-elevated)] px-[12px] py-[6px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] hover:text-[var(--text-primary)]"
					>
						{allCollapsed ? "Expand all" : "Collapse all"}
					</button>
				</div>
			</header>

			{/* ── L2: relevance-ranked file cards (logic → tests → generated) ──── */}
			<div className="mt-[12px] flex flex-col gap-[9px]">
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
						/>
					);
				})}

				{/* generated / trivia — collapsed to one row, never line-by-line */}
				<div className="rounded-[var(--r-subtle)] border border-dashed border-[var(--border-subtle)] bg-[var(--surface-container)]">
					<button
						type="button"
						onClick={() => setTriviaOpen((v) => !v)}
						className="flex w-full items-center gap-[9px] px-[12px] py-[9px] text-left"
					>
						<Chevron open={triviaOpen} />
						<span className="flex-1 text-[13px] text-[var(--text-secondary)]">
							<span className="font-mono tabular-nums font-[600] text-[var(--text-primary)]">{TRIVIA.count}</span>{" "}
							files · {TRIVIA.summary}
						</span>
						<ChangeBadge added={TRIVIA.added} removed={TRIVIA.removed} />
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
