/**
 * AJ7 — Annotator v2 design-exploration story.
 *
 * THREE working prototypes of a devtools-style element inspector for design review.
 * Each variant is self-contained and genuinely interactive in the :8098 viewer —
 * hover highlights, click selects, comment saves to an in-memory notes list, and
 * hovering a saved note RE-HIGHLIGHTS its element (computed fresh, no pins).
 *
 * This is a DESIGN PROTOTYPE (designer phase). It does NOT wire to the real
 * /__annotations persistence backend, does NOT mutate the inspected DOM, and is
 * not production-hardened — the builder does that in the green phase against the
 * approved variant. State is in-memory React state per story.
 *
 * @lore AJ7 OVERLAY-LAYER: the highlight overlay is a SEPARATE pointer-events:none
 * layer positioned by getBoundingClientRect() — it never adds a class to the
 * inspected element (concept hard-rule #1). This sidesteps AJ5's DOM-mutating
 * .anno-hover/.anno-selected outline approach and keeps the inspected layout intact.
 *
 * @lore AJ7 RE-HIGHLIGHT-NOT-PINS: nothing persists in the canvas. A saved note
 * stores a re-resolvable anchor (data-aj7-id here for the prototype); hovering the
 * note re-finds the element and draws the overlay fresh. No drift (concept rej #1).
 */

import { type JSX, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";

export default {
	title: "AnnotatorV2 (AJ7 design)",
	group: "System" as const,
	order: ["VariantADevtoolsRail", "VariantBFloatingEditor", "VariantCInspectorStrip"],
};

// ───────────────────────────────────────────────────────────────────────────
// Shared prototype primitives
// ───────────────────────────────────────────────────────────────────────────

interface Rect {
	top: number;
	left: number;
	width: number;
	height: number;
}

/** Resolved descriptor for a hovered/selected element (prototype stand-in for resolveComponentTarget). */
interface Target {
	component: string;
	element: string;
	/** re-resolvable anchor — prototype uses a data attribute; real impl stores a structural path */
	anchorId: string;
	el: HTMLElement;
}

interface SavedNote {
	id: string;
	component: string;
	element: string;
	anchorId: string;
	note: string;
}

/**
 * Prototype resolver. The real build reuses AJ5 resolveComponentTarget (React-fiber
 * walk). Here we read data attributes seeded on the sample canvas so the label is
 * realistic without booting the fiber machinery.
 */
function resolveTarget(el: HTMLElement, root: HTMLElement): Target {
	const host = (el.closest("[data-aj7-comp]") as HTMLElement | null) ?? el;
	const component = host.getAttribute("data-aj7-comp") ?? "unknown";
	const tag = el.tagName.toLowerCase();
	const cls = Array.from(el.classList)
		.filter((c) => !c.startsWith("aj7-"))
		.slice(0, 2)
		.map((c) => `.${c}`)
		.join("");
	const text = el.textContent?.trim() ?? "";
	const short = text.length > 0 && text.length <= 22 ? ` "${text}"` : "";
	const anchorId = ensureAnchor(el, root);
	return { component, element: `${tag}${cls}${short}`, anchorId, el };
}

let anchorSeq = 0;
/** Seed a stable re-resolvable id on the element so a note can re-find it. */
function ensureAnchor(el: HTMLElement, _root: HTMLElement): string {
	let id = el.getAttribute("data-aj7-id");
	if (!id) {
		anchorSeq += 1;
		id = `aj7-${anchorSeq}`;
		el.setAttribute("data-aj7-id", id);
	}
	return id;
}

function rectOf(el: HTMLElement): Rect {
	const r = el.getBoundingClientRect();
	return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Ancestor chain from el up to (not past) root — for the breadcrumb. */
function ancestorChain(el: HTMLElement, root: HTMLElement): Target[] {
	const out: Target[] = [];
	let cur: HTMLElement | null = el;
	while (cur && cur !== root.parentElement) {
		out.push(resolveTarget(cur, root));
		if (cur === root) break;
		cur = cur.parentElement;
	}
	return out.reverse(); // root-most first
}

/**
 * The highlight overlay layer: a box + floating label drawn over a rect.
 * pointer-events:none so it never blocks the picker. Reused by live hover,
 * held selection, and note re-highlight (3 contexts → earns its NEW shape).
 */
function HighlightOverlay({
	rect,
	label,
	tone = "hover",
}: {
	rect: Rect | null;
	label?: string;
	tone?: "hover" | "selected";
}): JSX.Element | null {
	if (!rect) return null;
	const labelTop = rect.top > 22 ? rect.top - 21 : rect.top + rect.height + 3;
	return (
		<>
			<div
				className="aj7-hl-box"
				data-tone={tone}
				style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
			/>
			{label && (
				<div className="aj7-hl-label" data-tone={tone} style={{ top: labelTop, left: rect.left }}>
					{label}
				</div>
			)}
		</>
	);
}

/**
 * Shared picker engine. Owns: armed, hovered target+rect, selected target+rect,
 * saved notes, and re-highlight rect. Returns handlers + render state. Every
 * variant composes its own chrome around this identical engine.
 */
function usePicker(): {
	rootRef: React.RefObject<HTMLDivElement | null>;
	armed: boolean;
	setArmed: (v: boolean) => void;
	hover: { target: Target; rect: Rect } | null;
	selected: { target: Target; rect: Rect } | null;
	notes: SavedNote[];
	reHi: { rect: Rect; label: string } | null;
	canvasHandlers: {
		onMouseMove: (e: React.MouseEvent) => void;
		onMouseLeave: () => void;
		onClick: (e: React.MouseEvent) => void;
	};
	save: (note: string) => void;
	clearSelection: () => void;
	reHighlightNote: (n: SavedNote) => void;
	clearReHighlight: () => void;
	selectAncestor: (t: Target) => void;
	chain: Target[];
} {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const [armed, setArmed] = useState(false);
	const [hover, setHover] = useState<{ target: Target; rect: Rect } | null>(null);
	const [selected, setSelected] = useState<{ target: Target; rect: Rect } | null>(null);
	const [notes, setNotes] = useState<SavedNote[]>([]);
	const [reHi, setReHi] = useState<{ rect: Rect; label: string } | null>(null);

	const onMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!armed || !rootRef.current) return;
			const el = e.target as HTMLElement;
			if (!rootRef.current.contains(el)) return;
			const target = resolveTarget(el, rootRef.current);
			setHover({ target, rect: rectOf(el) });
		},
		[armed],
	);
	const onMouseLeave = useCallback(() => setHover(null), []);
	const onClick = useCallback(
		(e: React.MouseEvent) => {
			if (!armed || !rootRef.current) return;
			e.preventDefault();
			e.stopPropagation();
			const el = e.target as HTMLElement;
			const target = resolveTarget(el, rootRef.current);
			setSelected({ target, rect: rectOf(el) });
			setHover(null);
			setArmed(false);
		},
		[armed],
	);

	const save = useCallback(
		(note: string) => {
			if (!selected || !note.trim()) return;
			setNotes((prev) => [
				...prev,
				{
					id: `n-${prev.length + 1}`,
					component: selected.target.component,
					element: selected.target.element,
					anchorId: selected.target.anchorId,
					note: note.trim(),
				},
			]);
			setSelected(null);
		},
		[selected],
	);
	const clearSelection = useCallback(() => setSelected(null), []);

	const reHighlightNote = useCallback((n: SavedNote) => {
		const root = rootRef.current;
		if (!root) return;
		const el = root.querySelector<HTMLElement>(`[data-aj7-id="${n.anchorId}"]`);
		if (!el) {
			setReHi(null);
			return;
		}
		setReHi({ rect: rectOf(el), label: `${n.component} · ${n.element}` });
	}, []);
	const clearReHighlight = useCallback(() => setReHi(null), []);

	const selectAncestor = useCallback((t: Target) => {
		setSelected({ target: t, rect: rectOf(t.el) });
	}, []);

	const chain = selected && rootRef.current ? ancestorChain(selected.target.el, rootRef.current) : [];

	return {
		rootRef,
		armed,
		setArmed,
		hover,
		selected,
		notes,
		reHi,
		canvasHandlers: { onMouseMove, onMouseLeave, onClick },
		save,
		clearSelection,
		reHighlightNote,
		clearReHighlight,
		selectAncestor,
		chain,
	};
}

// ───────────────────────────────────────────────────────────────────────────
// Sample canvas — realistic content to inspect (AQ-009). data-aj7-comp seeds the
// resolved "component" label the way data-ds-component does in real stories.
// ───────────────────────────────────────────────────────────────────────────

function SampleCanvas({
	rootRef,
	armed,
	handlers,
}: {
	rootRef: React.RefObject<HTMLDivElement | null>;
	armed: boolean;
	handlers: {
		onMouseMove: (e: React.MouseEvent) => void;
		onMouseLeave: () => void;
		onClick: (e: React.MouseEvent) => void;
	};
}): JSX.Element {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dev-only design prototype canvas
		<div
			ref={rootRef}
			className="aj7-canvas"
			data-armed={armed}
			onMouseMove={handlers.onMouseMove}
			onMouseLeave={handlers.onMouseLeave}
			onClickCapture={handlers.onClick}
		>
			<div className="aj7-betcard" data-aj7-comp="BetCard">
				<div className="aj7-betcard-head">
					<span className="aj7-betcard-title">Auth migration — passkey rollout</span>
					<span className="aj7-badge" data-aj7-comp="StatusChip">
						Active
					</span>
				</div>
				<div className="aj7-betcard-meta" data-aj7-comp="KeyValue">
					<span>Budget</span>
					<strong>$2,400</strong>
				</div>
				<div className="aj7-betcard-foot">
					<span className="aj7-avatar" data-aj7-comp="Avatar">
						AT
					</span>
					<span className="aj7-avatar aj7-avatar--agent" data-aj7-comp="Avatar">
						KO
					</span>
					<button type="button" className="aj7-btn" data-aj7-comp="Button">
						Open
					</button>
				</div>
			</div>

			<div className="aj7-threadrow" data-aj7-comp="ThreadRow">
				<span className="aj7-avatar" data-aj7-comp="Avatar">
					RB
				</span>
				<div className="aj7-threadrow-body">
					<div className="aj7-threadrow-title">Passkey rollout plan — phase 1 scope</div>
					<div className="aj7-threadrow-sub">Atlas · 2:38 PM</div>
				</div>
				<span className="aj7-count" data-aj7-comp="Badge">
					3
				</span>
			</div>
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────────────
// Shared comment input (re-housed per variant)
// ───────────────────────────────────────────────────────────────────────────

function CommentField({
	target,
	onSave,
	onCancel,
	autoFocus,
}: {
	target: Target;
	onSave: (note: string) => void;
	onCancel: () => void;
	autoFocus?: boolean;
}): JSX.Element {
	const [val, setVal] = useState("");
	return (
		<div className="aj7-comment">
			<div className="aj7-target" title={`${target.component} · ${target.element}`}>
				<span className="aj7-target-comp">{target.component}</span> ·{" "}
				<span className="aj7-target-el">{target.element}</span>
			</div>
			{/* biome-ignore lint/a11y/noAutofocus: dev-only design prototype */}
			<textarea
				className="aj7-textarea"
				autoFocus={autoFocus}
				value={val}
				placeholder="What should change about this element?"
				onChange={(e) => setVal(e.target.value)}
				rows={3}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(val);
					if (e.key === "Escape") onCancel();
				}}
			/>
			<div className="aj7-comment-actions">
				<button type="button" className="aj7-btn aj7-btn--save" onClick={() => onSave(val)}>
					Save
				</button>
				<button type="button" className="aj7-btn" onClick={onCancel}>
					Cancel
				</button>
			</div>
		</div>
	);
}

function ArmButton({
	armed,
	onToggle,
}: {
	armed: boolean;
	onToggle: () => void;
}): JSX.Element {
	return (
		<button
			type="button"
			className={`aj7-arm${armed ? " aj7-arm--on" : ""}`}
			aria-pressed={armed}
			onClick={onToggle}
		>
			<span className="aj7-arm-icon" aria-hidden>
				⌖
			</span>
			{armed ? "Selecting…" : "Inspect"}
		</button>
	);
}

function Breadcrumb({
	chain,
	currentEl,
	onPick,
}: {
	chain: Target[];
	currentEl: HTMLElement;
	onPick: (t: Target) => void;
}): JSX.Element {
	return (
		<div className="aj7-crumbs" aria-label="ancestor path">
			{chain.map((t, i) => (
				<span key={t.anchorId} className="aj7-crumb-wrap">
					{i > 0 && <span className="aj7-crumb-sep">›</span>}
					<button
						type="button"
						className={`aj7-crumb${t.el === currentEl ? " aj7-crumb--on" : ""}`}
						onClick={() => onPick(t)}
					>
						{t.component}
					</button>
				</span>
			))}
		</div>
	);
}

function NotesRows({
	notes,
	onHover,
	onLeave,
}: {
	notes: SavedNote[];
	onHover: (n: SavedNote) => void;
	onLeave: () => void;
}): JSX.Element {
	if (notes.length === 0) {
		return <div className="aj7-notes-empty">No notes yet. Inspect an element, then comment.</div>;
	}
	return (
		<ul className="aj7-notes">
			{notes.map((n) => (
				// biome-ignore lint/a11y/noStaticElementInteractions: dev-only re-highlight affordance
				<li key={n.id} className="aj7-note-row" onMouseEnter={() => onHover(n)} onMouseLeave={onLeave}>
					<span className="aj7-note-comp">{n.component}</span>
					<span className="aj7-note-text">{n.note}</span>
				</li>
			))}
		</ul>
	);
}

// Inject prototype CSS once (dev-only story; not part of the token system).
function ProtoStyles(): JSX.Element {
	// biome-ignore lint/security/noDangerouslySetInnerHtml: dev-only design prototype stylesheet
	return <style dangerouslySetInnerHTML={{ __html: PROTO_CSS }} />;
}

// ───────────────────────────────────────────────────────────────────────────
// VARIANT A — "Devtools rail"  (ref: Chrome / React DevTools)
// Persistent right-hand inspector rail. Arm + breadcrumb at top, docked comment
// input in the middle, notes list at the bottom. One chrome region.
// ───────────────────────────────────────────────────────────────────────────

export function VariantADevtoolsRail(): JSX.Element {
	const p = usePicker();
	return (
		<div className="aj7-stage aj7-stage--rail">
			<ProtoStyles />
			<div className="aj7-canvas-wrap">
				<SampleCanvas rootRef={p.rootRef} armed={p.armed} handlers={p.canvasHandlers} />
			</div>

			<aside className="aj7-rail">
				<div className="aj7-rail-head">
					<ArmButton armed={p.armed} onToggle={() => p.setArmed(!p.armed)} />
					<span className="aj7-round">Round 1 · {p.notes.length} notes</span>
				</div>

				{p.selected ? (
					<div className="aj7-rail-section">
						<Breadcrumb chain={p.chain} currentEl={p.selected.target.el} onPick={p.selectAncestor} />
						<CommentField
							target={p.selected.target}
							onSave={p.save}
							onCancel={p.clearSelection}
							autoFocus
						/>
					</div>
				) : (
					<div className="aj7-rail-hint">
						{p.armed
							? "Hover the canvas — click an element to comment."
							: "Press Inspect, then hover + click any element."}
					</div>
				)}

				<div className="aj7-rail-notes">
					<div className="aj7-section-label">Notes · Round 1</div>
					<NotesRows notes={p.notes} onHover={p.reHighlightNote} onLeave={p.clearReHighlight} />
				</div>
			</aside>

			<OverlayLayer p={p} />
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────────────
// VARIANT B — "Floating editor"  (ref: v0 / Lovable / Figma pin-less comment)
// Minimal bottom-left pill (AJ5 lineage). On select, a small comment card FLOATS
// next to the selected element, anchored to the highlight box. Notes are a
// separate bottom-left popup. No breadcrumb (deferred). Three floating regions.
// ───────────────────────────────────────────────────────────────────────────

export function VariantBFloatingEditor(): JSX.Element {
	const p = usePicker();
	const [showNotes, setShowNotes] = useState(false);
	return (
		<div className="aj7-stage">
			<ProtoStyles />
			<div className="aj7-canvas-wrap aj7-canvas-wrap--full">
				<SampleCanvas rootRef={p.rootRef} armed={p.armed} handlers={p.canvasHandlers} />
			</div>

			{/* bottom-left pill */}
			<div className="aj7-pill">
				<ArmButton armed={p.armed} onToggle={() => p.setArmed(!p.armed)} />
				<span className="aj7-round">Round 1</span>
				<button type="button" className="aj7-count-btn" onClick={() => setShowNotes((v) => !v)}>
					{p.notes.length} notes
				</button>
			</div>

			{/* floating comment card anchored to the selected element */}
			{p.selected && (
				<FloatingAt rect={p.selected.rect}>
					<CommentField
						target={p.selected.target}
						onSave={p.save}
						onCancel={p.clearSelection}
						autoFocus
					/>
				</FloatingAt>
			)}

			{/* notes popup */}
			{showNotes && (
				<div className="aj7-notes-pop">
					<div className="aj7-section-label">Notes · Round 1</div>
					<NotesRows notes={p.notes} onHover={p.reHighlightNote} onLeave={p.clearReHighlight} />
				</div>
			)}

			<OverlayLayer p={p} />
		</div>
	);
}

/** Position a floating card next to a rect, flipping below if no room above. */
function FloatingAt({ rect, children }: { rect: Rect; children: ReactNode }): JSX.Element {
	const ref = useRef<HTMLDivElement | null>(null);
	const [pos, setPos] = useState<{ top: number; left: number }>({
		top: rect.top + rect.height + 8,
		left: rect.left,
	});
	useLayoutEffect(() => {
		const h = ref.current?.offsetHeight ?? 140;
		const above = rect.top - h - 8;
		setPos({ top: above > 8 ? above : rect.top + rect.height + 8, left: rect.left });
	}, [rect]);
	return (
		<div ref={ref} className="aj7-floater" style={{ top: pos.top, left: pos.left }}>
			{children}
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────────────
// VARIANT C — "Inspector strip"  (ref: Linear bottom bar / browser console drawer)
// A docked bottom strip spanning the width. Left: live target + breadcrumb +
// comment input. Right: notes as horizontally-scrolling chips with re-highlight.
// One unified surface, always present.
// ───────────────────────────────────────────────────────────────────────────

export function VariantCInspectorStrip(): JSX.Element {
	const p = usePicker();
	return (
		<div className="aj7-stage aj7-stage--strip">
			<ProtoStyles />
			<div className="aj7-canvas-wrap aj7-canvas-wrap--strip">
				<SampleCanvas rootRef={p.rootRef} armed={p.armed} handlers={p.canvasHandlers} />
			</div>

			<div className="aj7-strip">
				<div className="aj7-strip-left">
					<ArmButton armed={p.armed} onToggle={() => p.setArmed(!p.armed)} />
					{p.selected ? (
						<div className="aj7-strip-edit">
							<Breadcrumb
								chain={p.chain}
								currentEl={p.selected.target.el}
								onPick={p.selectAncestor}
							/>
							<CommentField
								target={p.selected.target}
								onSave={p.save}
								onCancel={p.clearSelection}
								autoFocus
							/>
						</div>
					) : (
						<span className="aj7-strip-hint">
							{p.armed ? "Hover + click an element to comment." : "Press Inspect to begin."}
						</span>
					)}
				</div>
				<div className="aj7-strip-right">
					<div className="aj7-section-label">Round 1 · {p.notes.length}</div>
					<div className="aj7-chips">
						{p.notes.length === 0 ? (
							<span className="aj7-notes-empty">No notes yet.</span>
						) : (
							p.notes.map((n) => (
								// biome-ignore lint/a11y/noStaticElementInteractions: dev-only re-highlight affordance
								<div
									key={n.id}
									className="aj7-chip"
									onMouseEnter={() => p.reHighlightNote(n)}
									onMouseLeave={p.clearReHighlight}
								>
									<span className="aj7-note-comp">{n.component}</span>
									<span className="aj7-chip-text">{n.note}</span>
								</div>
							))
						)}
					</div>
				</div>
			</div>

			<OverlayLayer p={p} />
		</div>
	);
}

// ───────────────────────────────────────────────────────────────────────────
// Shared overlay layer — renders hover, held-selection, and re-highlight boxes.
// ───────────────────────────────────────────────────────────────────────────

function OverlayLayer({ p }: { p: ReturnType<typeof usePicker> }): JSX.Element {
	return (
		<>
			{/* live hover (only while armed) */}
			{p.hover && (
				<HighlightOverlay
					rect={p.hover.rect}
					label={`${p.hover.target.component} · ${p.hover.target.element}`}
					tone="hover"
				/>
			)}
			{/* held selection box while commenting */}
			{p.selected && !p.hover && (
				<HighlightOverlay
					rect={p.selected.rect}
					label={`${p.selected.target.component} · ${p.selected.target.element}`}
					tone="selected"
				/>
			)}
			{/* note re-highlight (computed fresh on row hover) */}
			{p.reHi && <HighlightOverlay rect={p.reHi.rect} label={p.reHi.label} tone="selected" />}
		</>
	);
}

// ───────────────────────────────────────────────────────────────────────────
// Prototype stylesheet (dev-only; uses Hearth tokens where they exist).
// ───────────────────────────────────────────────────────────────────────────

const PROTO_CSS = `
/* Hide the legacy AJ5 review pill while the v2 prototype is on screen — it lives
   bottom-left and would collide with variant B/C chrome. The builder removes it
   for real in the green phase; this is prototype-only suppression. */
.anno-pill, .anno-popover, .anno-list-panel { display: none !important; }

.aj7-stage { position: relative; min-height: 520px; font-family: var(--font-sans, system-ui); }
.aj7-stage--rail { display: grid; grid-template-columns: 1fr 320px; gap: 16px; }
.aj7-stage--strip { padding-bottom: 12px; }

.aj7-canvas-wrap { padding: 4px; }
.aj7-canvas { display: flex; flex-direction: column; gap: 16px; padding: 20px; background: var(--surface-page, #f5f0e6); border-radius: var(--r-default, 16px); border: 1px solid var(--border-default, #d5cbb8); }
.aj7-canvas[data-armed="true"] { cursor: crosshair; }

/* sample components */
.aj7-betcard { background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-default, 16px); box-shadow: var(--shadow-elevated, 0 8px 24px rgba(44,36,26,.1)); padding: 16px; display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
.aj7-betcard-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.aj7-betcard-title { font-size: 14px; font-weight: 600; color: var(--text-primary, #2c241a); }
.aj7-badge { font-size: 12px; padding: 3px 9px; border-radius: 9999px; background: var(--accent-primary-dim, rgba(22,118,79,.08)); color: var(--accent-primary, #16764f); font-weight: 500; }
.aj7-betcard-meta { display: flex; gap: 8px; align-items: baseline; font-size: 13px; color: var(--text-secondary, #6b5d4d); }
.aj7-betcard-meta strong { color: var(--text-primary, #2c241a); }
.aj7-betcard-foot { display: flex; align-items: center; gap: 6px; }
.aj7-avatar { width: 28px; height: 28px; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; background: var(--surface-container, #ece4d6); color: var(--text-secondary, #6b5d4d); border: 2px solid var(--surface-elevated, #fff); }
.aj7-avatar--agent { background: rgba(22,118,79,.08); color: var(--accent-primary, #16764f); border-color: var(--accent-primary, #16764f); margin-left: -8px; }
.aj7-btn { margin-left: auto; font-size: 12px; padding: 5px 14px; border-radius: 9999px; border: 1px solid var(--border-default, #d5cbb8); background: var(--surface-elevated, #fff); color: var(--text-primary, #2c241a); cursor: pointer; }
.aj7-threadrow { display: flex; align-items: center; gap: 10px; background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-default, 16px); padding: 12px 14px; max-width: 420px; }
.aj7-threadrow-body { flex: 1; min-width: 0; }
.aj7-threadrow-title { font-size: 13px; font-weight: 500; color: var(--text-primary, #2c241a); }
.aj7-threadrow-sub { font-size: 12px; color: var(--text-tertiary, #9a8d7e); }
.aj7-count { font-size: 11px; min-width: 20px; text-align: center; padding: 3px 6px; border-radius: 9999px; background: var(--surface-container, #ece4d6); color: var(--text-secondary, #6b5d4d); }

/* highlight overlay layer — separate, pointer-events:none, never mutates canvas */
.aj7-hl-box { position: fixed; pointer-events: none; z-index: 99996; border-radius: 4px; box-sizing: border-box; }
.aj7-hl-box[data-tone="hover"] { outline: 2px solid var(--accent-primary, #16764f); background: rgba(22,118,79,.06); }
.aj7-hl-box[data-tone="selected"] { outline: 2px dashed var(--accent-primary, #16764f); background: rgba(22,118,79,.10); }
.aj7-hl-label { position: fixed; pointer-events: none; z-index: 99997; font-family: var(--font-mono, ui-monospace); font-size: 11px; line-height: 1.4; padding: 1px 6px; border-radius: 4px; color: #fff; background: var(--accent-primary, #16764f); white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 2px 6px rgba(0,0,0,.18); }

/* arm button */
.aj7-arm { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; padding: 6px 14px; border-radius: 9999px; border: 1px solid var(--border-default, #d5cbb8); background: var(--surface-elevated, #fff); color: var(--text-primary, #2c241a); cursor: pointer; }
.aj7-arm--on { background: var(--accent-primary, #16764f); color: #fff; border-color: var(--accent-primary, #16764f); }
.aj7-arm-icon { font-size: 14px; }
.aj7-round { font-family: var(--font-mono, ui-monospace); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-tertiary, #9a8d7e); }

/* comment field */
.aj7-comment { display: flex; flex-direction: column; gap: 8px; }
.aj7-target { font-family: var(--font-mono, ui-monospace); font-size: 11px; color: var(--text-secondary, #6b5d4d); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aj7-target-comp { color: var(--text-primary, #2c241a); font-weight: 600; }
.aj7-target-el { color: var(--text-tertiary, #9a8d7e); }
.aj7-textarea { width: 100%; box-sizing: border-box; min-height: 60px; background: var(--surface-page, #f5f0e6); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-subtle, 10px); color: var(--text-primary, #2c241a); font-family: var(--font-sans, system-ui); font-size: 13px; line-height: 1.5; padding: 8px 10px; resize: vertical; outline: none; }
.aj7-textarea:focus { border-color: var(--accent-primary, #16764f); }
.aj7-comment-actions { display: flex; gap: 6px; }
.aj7-btn--save { background: var(--accent-primary, #16764f); color: #fff; border-color: var(--accent-primary, #16764f); margin-left: 0; }

/* breadcrumb */
.aj7-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
.aj7-crumb-wrap { display: inline-flex; align-items: center; }
.aj7-crumb-sep { color: var(--text-tertiary, #9a8d7e); font-size: 11px; margin: 0 2px; }
.aj7-crumb { font-family: var(--font-mono, ui-monospace); font-size: 11px; padding: 1px 6px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-secondary, #6b5d4d); cursor: pointer; }
.aj7-crumb:hover { background: var(--accent-primary-dim, rgba(22,118,79,.08)); }
.aj7-crumb--on { background: var(--accent-primary-dim, rgba(22,118,79,.08)); color: var(--accent-primary, #16764f); font-weight: 600; }

/* notes */
.aj7-section-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-tertiary, #9a8d7e); margin-bottom: 6px; }
.aj7-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.aj7-note-row { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: var(--r-subtle, 10px); cursor: default; }
.aj7-note-row:hover { background: var(--accent-primary-dim, rgba(22,118,79,.08)); }
.aj7-note-comp { font-family: var(--font-mono, ui-monospace); font-size: 11px; font-weight: 600; color: var(--text-primary, #2c241a); }
.aj7-note-text { font-size: 12px; color: var(--text-secondary, #6b5d4d); line-height: 1.4; }
.aj7-notes-empty { font-size: 12px; color: var(--text-tertiary, #9a8d7e); padding: 6px 0; }

/* variant A rail */
.aj7-rail { align-self: start; position: sticky; top: 12px; background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-default, 16px); box-shadow: var(--shadow-elevated, 0 8px 24px rgba(44,36,26,.1)); padding: 14px; display: flex; flex-direction: column; gap: 14px; }
.aj7-rail-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.aj7-rail-section { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-subtle, 10px); background: var(--surface-page, #f5f0e6); }
.aj7-rail-hint { font-size: 12px; color: var(--text-tertiary, #9a8d7e); line-height: 1.5; padding: 8px 0; }
.aj7-rail-notes { border-top: 1px solid var(--border-default, #d5cbb8); padding-top: 12px; }

/* variant B pill + floater */
.aj7-canvas-wrap--full { min-height: 480px; }
.aj7-pill { position: fixed; bottom: 14px; left: 14px; z-index: 99998; display: flex; align-items: center; gap: 8px; background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: 9999px; box-shadow: var(--shadow-elevated, 0 8px 24px rgba(44,36,26,.1)); padding: 6px 10px; }
.aj7-count-btn { font-family: var(--font-mono, ui-monospace); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-tertiary, #9a8d7e); background: transparent; border: none; cursor: pointer; }
.aj7-floater { position: fixed; z-index: 99999; width: 300px; background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-subtle, 10px); box-shadow: var(--shadow-elevated, 0 8px 24px rgba(44,36,26,.1)); padding: 12px; }
.aj7-notes-pop { position: fixed; bottom: 60px; left: 14px; z-index: 99998; width: 300px; max-height: 280px; overflow-y: auto; background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-subtle, 10px); box-shadow: var(--shadow-elevated, 0 8px 24px rgba(44,36,26,.1)); padding: 12px; }

/* variant C strip */
.aj7-canvas-wrap--strip { min-height: 360px; }
.aj7-strip { position: sticky; bottom: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: var(--surface-elevated, #fff); border: 1px solid var(--border-default, #d5cbb8); border-radius: var(--r-default, 16px); box-shadow: var(--shadow-elevated, 0 8px 24px rgba(44,36,26,.1)); padding: 14px 16px; margin-top: 12px; }
.aj7-strip-left { display: flex; flex-direction: column; gap: 10px; }
.aj7-strip-edit { display: flex; flex-direction: column; gap: 8px; }
.aj7-strip-hint { font-size: 12px; color: var(--text-tertiary, #9a8d7e); }
.aj7-strip-right { border-left: 1px solid var(--border-default, #d5cbb8); padding-left: 16px; min-width: 0; }
.aj7-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow-y: auto; }
.aj7-chip { display: flex; flex-direction: column; gap: 2px; max-width: 220px; padding: 6px 10px; border-radius: var(--r-subtle, 10px); border: 1px solid var(--border-default, #d5cbb8); background: var(--surface-page, #f5f0e6); cursor: default; }
.aj7-chip:hover { border-color: var(--accent-primary, #16764f); }
.aj7-chip-text { font-size: 12px; color: var(--text-secondary, #6b5d4d); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;
