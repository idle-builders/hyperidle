// AL1 review canvas #6 — ReviewVisualDiff: the visual before→after canvas.
//
// Proof family: visual before→after (Figma design frame vs the implemented screen).
// Tool-grounded: Figma mini-logo on the canvas + on each render pane.
//
// 3-layer drill-down (the signature):
//   L1  one glance  — side-by-side THUMBNAILS (Design ↔ Build) + Figma logo + "3 regions differ".
//   L2  the proof   — before/after AT SIZE with a compare-mode toggle (Side-by-side · Overlay · Swipe).
//   L3  on demand   — the differing regions flagged as chips; clicking one highlights it on both renders.
//
// Offline determinism: there are no real image URLs, so the "design" and "build" screens are
// hand-rendered as Hearth-styled divs (an onboarding screen: header, form, CTA). They differ in
// three spots — CTA color, a missing field, hero spacing — which are exactly the flagged regions.
//
// Chrome tokens are Hearth/CP1 by NAME (var(--token)). The mock screens stay on-palette too; the
// only hex in this surface comes from <ToolLogo> (tool identity, AQ-008 exempt).
//
// States: populated (default, story). empty → "No design frame linked to compare." loading →
// skeleton: two pulsing thumbnail blocks + a region-chip row of bars. needs-you emphasis → the
// region count pill uses --accent-secondary-dim (amber) and the strongest region (the missing
// field, severity `change`) pins first via relevance-ordering.
//
// hearth-internal-padding: pane chrome uses optically-tuned inner padding alongside grid spacing.

import { type CSSProperties, type JSX, useState } from "react";
import { CanvasSourceHeader } from "./CanvasSourceHeader";
import { isPlainObject, isString } from "./payload-guard";
import type { ReviewCanvasProps, VisualDiffPayload } from "./review-artifact";
import { ToolLogo } from "./ToolLogo";

// ── Fixture ────────────────────────────────────────────────────────────────
// A region the diff flags. `side` says where the difference lives so a render
// pane can self-highlight the affected band when the region is selected.
type RegionId = "cta" | "email" | "hero";

interface DiffRegion {
	readonly id: RegionId;
	/** the band this region maps to on the screen renders. */
	readonly band: "hero" | "form" | "cta";
	/** materiality — `change` floats above `tweak` so the missing field leads. */
	readonly severity: "change" | "tweak";
	readonly label: string;
	readonly design: string;
	readonly build: string;
}

interface VisualDiff {
	readonly title: string;
	readonly frame: string; // Figma frame name
	readonly tool: "figma";
	readonly designedBy: string;
	readonly builtIn: string;
	readonly regions: readonly DiffRegion[];
}

const FIXTURE: VisualDiff = {
	title: "Onboarding · Create account",
	frame: "Onboarding / Account · v4",
	tool: "figma",
	designedBy: "Onboarding-v4 frame",
	builtIn: "SignupScreen.tsx",
	// relevance-ordered: the missing field (a `change`) floats above the two tweaks.
	regions: [
		{
			id: "email",
			band: "form",
			severity: "change",
			label: "Email field missing in build",
			design: "Email + Password (2 fields)",
			build: "Password only (1 field)",
		},
		{
			id: "cta",
			band: "cta",
			severity: "tweak",
			label: "CTA color forest vs amber",
			design: "--accent-primary (forest)",
			build: "--accent-secondary (amber)",
		},
		{
			id: "hero",
			band: "hero",
			severity: "tweak",
			label: "Hero spacing 24 → 16",
			design: "--space-8 (24px)",
			build: "--space-6 (18px)",
		},
	],
};

type CompareMode = "side" | "overlay" | "swipe";

const MODES: readonly { readonly id: CompareMode; readonly label: string }[] = [
	{ id: "side", label: "Side-by-side" },
	{ id: "overlay", label: "Overlay" },
	{ id: "swipe", label: "Swipe" },
];

// ── Mock screens (Hearth-styled divs, no external image) ─────────────────────
// `variant` picks design vs build; `active` is the currently-selected region so
// the affected band lights up. Everything is var(--token) — fully deterministic.

interface ScreenProps {
	readonly variant: "design" | "build";
	readonly active: RegionId | null;
}

const HL: CSSProperties = {
	outline: "2px solid var(--accent-primary)",
	outlineOffset: 2,
	borderRadius: "var(--r-subtle)",
};

function MockScreen({ variant, active }: ScreenProps): JSX.Element {
	const isDesign = variant === "design";
	// hero spacing differs: design 24px, build 18px.
	const heroPad = isDesign ? 24 : 18;
	// CTA color differs: design forest, build amber.
	const ctaBg = isDesign ? "var(--accent-primary)" : "var(--accent-secondary)";

	return (
		<div
			className="border-[var(--bw-thin)] overflow-hidden  border-[var(--border-default)] bg-[var(--surface-page)]"
			style={{ borderRadius: "var(--r-default)" }}
		>
			{/* hero band */}
			<div
				className="border-b-[var(--bw-thin)]  border-[var(--border-subtle)] bg-[var(--surface-container)]"
				style={{ padding: heroPad, ...(active === "hero" ? HL : {}) }}
			>
				<div className="type-lead   text-[var(--text-primary)]">Create your account</div>
				<div className="type-metadata mt-[3px]  text-[var(--text-tertiary)]">
					Start your 14-day trial — no card required.
				</div>
			</div>

			{/* form band */}
			<div className="p-[18px]" style={active === "email" ? HL : undefined}>
				{isDesign ? <Field label="Email" placeholder="you@company.com" /> : null}
				<div className={isDesign ? "mt-[12px]" : ""}>
					<Field label="Password" placeholder="••••••••" />
				</div>
			</div>

			{/* cta band */}
			<div className="px-[18px] pb-[18px]" style={active === "cta" ? HL : undefined}>
				<div
					className="type-small flex h-[36px] items-center justify-center   text-[var(--text-on-accent)]"
					style={{ background: ctaBg, borderRadius: "var(--r-pill)" }}
				>
					Create account
				</div>
			</div>
		</div>
	);
}

function Field({ label, placeholder }: { label: string; placeholder: string }): JSX.Element {
	return (
		<div>
			<div className="type-label mb-[3px]   text-[var(--text-secondary)]">{label}</div>
			<div
				className="type-metadata border-[var(--bw-thin)] flex h-[30px] items-center  border-[var(--border-default)] bg-[var(--surface-elevated)] px-[9px]  text-[var(--text-placeholder)]"
				style={{ borderRadius: "var(--r-subtle)" }}
			>
				{placeholder}
			</div>
		</div>
	);
}

// A labelled render pane (used at-size in L2). Carries the Figma logo + which side it is.
function RenderPane({
	variant,
	source,
	active,
}: {
	readonly variant: "design" | "build";
	readonly source: string;
	readonly active: RegionId | null;
}): JSX.Element {
	const isDesign = variant === "design";
	return (
		<div className="flex flex-col gap-[6px]">
			<div className="flex items-center gap-[6px]">
				<ToolLogo tool="figma" size="sm" label="" />
				<span className="type-label   uppercase  text-[var(--text-secondary)]">
					{isDesign ? "Design" : "Build"}
				</span>
				<span className="type-metadata  text-[var(--text-tertiary)] truncate">{source}</span>
			</div>
			<MockScreen variant={variant} active={active} />
		</div>
	);
}

// ── L1: thumbnail (compact, non-interactive, for the one-glance summary) ──────
function Thumb({ variant }: { readonly variant: "design" | "build" }): JSX.Element {
	const isDesign = variant === "design";
	const ctaBg = isDesign ? "var(--accent-primary)" : "var(--accent-secondary)";
	return (
		<div
			className="border-[var(--bw-thin)] w-[72px] shrink-0 overflow-hidden  border-[var(--border-default)] bg-[var(--surface-page)]"
			style={{ borderRadius: "var(--r-subtle)" }}
			aria-hidden="true"
		>
			<div className="h-[16px] bg-[var(--surface-container)]" />
			<div className="flex flex-col gap-[3px] p-[6px]">
				{(isDesign ? [0, 1] : [0]).map((i) => (
					<div key={i} className="h-[6px] bg-[var(--surface-elevated)]" />
				))}
				<div className="mt-[3px] h-[8px] rounded-[var(--r-pill)]" style={{ background: ctaBg }} />
			</div>
		</div>
	);
}

export interface ReviewVisualDiffProps {
	readonly diff?: VisualDiff;
	readonly onApprove?: () => void;
	readonly onFlag?: (region: RegionId) => void;
}

function ReviewVisualDiffView({ diff = FIXTURE, onFlag }: ReviewVisualDiffProps): JSX.Element {
	const [mode, setMode] = useState<CompareMode>("side");
	const [selected, setSelected] = useState<RegionId | null>(null);
	// overlay opacity (design under, build over); swipe split position.
	const [overlay, setOverlay] = useState<number>(50);

	const count = diff.regions.length;

	function pick(id: RegionId): void {
		setSelected((cur) => (cur === id ? null : id));
		onFlag?.(id);
	}

	return (
		<section
			className="border-[var(--bw-thin)] flex flex-col  border-[var(--border-subtle)] bg-[var(--surface-container)]"
			style={{
				borderRadius: "var(--r-default)",
				boxShadow: "var(--shadow-default)",
				maxWidth: 760,
			}}
		>
			<div className="flex flex-col gap-[12px] p-[18px]">
				{/* ── L1: one-glance summary (tool/title now in source header) ── */}
				<header className="flex items-start gap-[12px]">
					<div className="flex gap-[6px]">
						<Thumb variant="design" />
						<Thumb variant="build" />
					</div>
					<div className="flex min-w-0 flex-col gap-[3px]">
						<div className="flex items-center gap-[6px]">
							<span
								data-spacing-role="compact-pill"
								className="type-metadata inline-flex items-center gap-[4px] px-[9px] py-[3px]   text-[var(--status-warning)]"
								style={{ background: "var(--accent-secondary-dim)", borderRadius: "var(--r-pill)" }}
							>
								{count} regions differ
							</span>
							<span className="type-metadata  text-[var(--text-tertiary)] truncate">
								{diff.frame} → {diff.builtIn}
							</span>
						</div>
					</div>
				</header>

				{/* ── L2: at-size compare + mode toggle ── */}
				<div className="flex items-center gap-[6px]">
					<div
						className="border-[var(--bw-thin)] inline-flex gap-[3px]  border-[var(--border-subtle)] bg-[var(--surface-page)] p-[3px]"
						style={{ borderRadius: "var(--r-pill)" }}
						role="tablist"
						aria-label="Compare mode"
					>
						{MODES.map((m) => {
							const on = m.id === mode;
							return (
								<button
									key={m.id}
									type="button"
									role="tab"
									aria-selected={on}
									onClick={() => setMode(m.id)}
									className="type-control px-[12px] py-[6px]     "
									style={{
										borderRadius: "var(--r-pill)",
										background: on ? "var(--accent-primary)" : "transparent",
										color: on ? "var(--text-on-accent)" : "var(--text-secondary)",
									}}
								>
									{m.label}
								</button>
							);
						})}
					</div>
					{mode === "overlay" || mode === "swipe" ? (
						<label className="type-metadata flex items-center gap-[6px]  text-[var(--text-tertiary)]">
							{mode === "overlay" ? "Build opacity" : "Reveal"}
							<input
								type="range"
								min={0}
								max={100}
								value={overlay}
								onChange={(e) => setOverlay(Number(e.target.value))}
								className="range range-xs w-[120px]"
								aria-label={mode === "overlay" ? "Build opacity" : "Swipe reveal"}
							/>
						</label>
					) : null}
				</div>

				{mode === "side" ? (
					<div className="grid grid-cols-2 gap-[12px]">
						<RenderPane variant="design" source={diff.designedBy} active={selected} />
						<RenderPane variant="build" source={diff.builtIn} active={selected} />
					</div>
				) : (
					<div className="flex flex-col gap-[6px]">
						<div className="flex items-center gap-[6px]">
							<ToolLogo tool="figma" size="sm" label="" />
							<span className="type-label   uppercase  text-[var(--text-secondary)]">
								Design under · Build over
							</span>
						</div>
						{/* overlay = build pane stacked over design at `overlay`% opacity.
					    swipe   = build pane clipped to the left `overlay`% (a wipe). */}
						<div className="relative">
							<MockScreen variant="design" active={selected} />
							<div
								className="absolute inset-0"
								style={
									mode === "overlay"
										? { opacity: overlay / 100 }
										: { clipPath: `inset(0 ${100 - overlay}% 0 0)` }
								}
							>
								<MockScreen variant="build" active={selected} />
							</div>
							{mode === "swipe" ? (
								<div
									className="pointer-events-none absolute inset-y-0 w-[3px] bg-[var(--accent-primary)]"
									style={{ left: `${overlay}%` }}
									aria-hidden="true"
								/>
							) : null}
						</div>
					</div>
				)}

				{/* ── L3: flagged regions (relevance-ordered; click to highlight) ── */}
				<div className="flex flex-col gap-[6px]">
					<div className="type-label   uppercase  text-[var(--text-tertiary)]">
						Differing regions
					</div>
					<div className="flex flex-wrap gap-[6px]">
						{diff.regions.map((r) => {
							const on = r.id === selected;
							const major = r.severity === "change";
							return (
								<button
									key={r.id}
									type="button"
									aria-pressed={on}
									onClick={() => pick(r.id)}
									className="border-[var(--bw-thin)] flex flex-col gap-[3px]  px-[12px] py-[6px] text-left   "
									style={{
										borderRadius: "var(--r-subtle)",
										borderColor: on ? "var(--accent-primary)" : "var(--border-default)",
										background: on ? "var(--accent-primary-dim)" : "var(--surface-page)",
									}}
								>
									<span className="type-metadata flex items-center gap-[6px]   text-[var(--text-primary)]">
										<span
											aria-hidden="true"
											className="inline-block h-[6px] w-[6px] rounded-[var(--r-pill)]"
											style={{
												background: major ? "var(--status-warning)" : "var(--text-tertiary)",
											}}
										/>
										{r.label}
									</span>
									<span className="type-metadata  text-[var(--text-tertiary)]">
										<span className="line-through">{r.design}</span> → {r.build}
									</span>
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}

// AL2 — review artifact wrapper.
function isVisualDiffPayload(payload: unknown): payload is VisualDiffPayload {
	return (
		isPlainObject(payload) &&
		isPlainObject(payload.before) &&
		isString((payload.before as Record<string, unknown>).label) &&
		isPlainObject(payload.after) &&
		isString((payload.after as Record<string, unknown>).label) &&
		Array.isArray(payload.diffRegions)
	);
}

const REGION_IDS: readonly RegionId[] = ["cta", "email", "hero"];

function isRegionId(value: unknown): value is RegionId {
	return isString(value) && REGION_IDS.includes(value as RegionId);
}

function mapVisualPayload(payload: VisualDiffPayload): VisualDiff {
	return {
		title: "Onboarding · Create account",
		frame: `${payload.before.label} vs ${payload.after.label}`,
		tool: "figma",
		designedBy: payload.before.label,
		builtIn: payload.after.label,
		regions: payload.diffRegions
			.filter(
				(r): r is { readonly id: string; readonly label: string } =>
					isPlainObject(r) && isString(r.id) && isString(r.label),
			)
			.map((r) => ({
				id: isRegionId(r.id) ? r.id : "cta",
				band: "form" as const,
				severity: "change" as const,
				label: r.label,
				design: "",
				build: "",
			})),
	};
}

export function ReviewVisualDiff({ artifact }: ReviewCanvasProps): JSX.Element {
	const diff = isVisualDiffPayload(artifact.payload) ? mapVisualPayload(artifact.payload) : FIXTURE;
	return (
		<div className="flex flex-col gap-[12px]">
			<CanvasSourceHeader
				tool={artifact.tool}
				app={artifact.app}
				record={artifact.title}
				href={artifact.sourceHref}
			/>
			<ReviewVisualDiffView diff={diff} />
		</div>
	);
}
