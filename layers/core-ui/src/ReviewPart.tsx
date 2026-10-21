import type { ReviewPart as Part, Spot } from "@hyperidle/domain-model";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PinThread } from "./review-page";

/**
 * One part of a review, with its pins on it. Each kind of part is pointed at its own way: an
 * element of a page, a line of code, a region of an image, a figure, a stretch of text, one of
 * the items. Pointing makes a new pin; the page decides what happens with it.
 */
export const DEVICES = [
	{ id: "desktop", name: "Desktop", w: 1280 },
	{ id: "tablet", name: "Tablet", w: 834 },
	{ id: "phone", name: "Phone", w: 390 },
] as const;

export interface Point {
	readonly spot?: Spot;
	readonly label: string;
}

interface At {
	readonly top: number;
	readonly left: number;
}

const PIN = 22;
const POP = 300;

/** A few words for what was pointed at, in quotes. */
function quote(text: string): string {
	const t = text.replace(/\s+/g, " ").trim();
	return t.length > 40 ? `“${t.slice(0, 39)}…”` : `“${t}”`;
}

/** A selector that finds `el` again in the same page. */
function selectorOf(el: Element): string {
	const steps: string[] = [];
	for (let e: Element | null = el; e && e.tagName !== "BODY" && e.tagName !== "HTML"; ) {
		if (e.id) {
			steps.unshift(`#${CSS.escape(e.id)}`);
			break;
		}
		const tag = e.tagName.toLowerCase();
		const parent: Element | null = e.parentElement;
		const same = parent ? [...parent.children].filter((c) => c.tagName === e?.tagName) : [];
		steps.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(e) + 1})` : tag);
		e = parent;
	}
	return steps.join(" > ") || "body";
}

/** Where the words in `el` are drawn, or the element's box when it has none. */
function wordsRect(el: Element): DOMRect {
	const range = el.ownerDocument.createRange();
	range.selectNodeContents(el);
	const r = range.getBoundingClientRect();
	return r.width > 0 ? r : el.getBoundingClientRect();
}

/** The paragraph text node holding character `offset` of a text part's body, and the offset in it. */
function nodeAt(root: HTMLElement, offset: number): [Node, number] | null {
	let found: [Node, number] | null = null;
	for (const p of root.querySelectorAll<HTMLElement>("[data-start]")) {
		const start = Number(p.dataset.start);
		const node = p.firstChild;
		if (!node || start > offset) break;
		found = [node, Math.min(offset - start, node.textContent?.length ?? 0)];
	}
	return found;
}

function offsetOf(node: Node | null, offset: number): number | null {
	const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
	const p = el?.closest<HTMLElement>("[data-start]");
	if (!p || node?.nodeType !== Node.TEXT_NODE) return null;
	return Number(p.dataset.start) + offset;
}

/** Where a pin goes on `body`: just after the words it points at, or in the corner of a box. */
function locate(body: HTMLElement, spot: Spot | undefined): At | null {
	const b = body.getBoundingClientRect();
	const after = (r: DOMRect, dx = 0, dy = 0): At => ({
		top: r.top - b.top - 8 + dy,
		left: r.right - b.left + 4 + dx,
	});
	const corner = (r: DOMRect): At => ({ top: r.top - b.top + 6, left: r.right - b.left - PIN - 8 });
	if (!spot) return { top: 8, left: b.width - PIN - 8 };
	switch (spot.kind) {
		case "element": {
			const frame = body.querySelector("iframe");
			const el = frame?.contentDocument?.querySelector(spot.selector);
			if (!(frame && el)) return null;
			const f = frame.getBoundingClientRect();
			const r = wordsRect(el);
			return after(r, f.left, f.top);
		}
		case "line": {
			const key = `${spot.file}|${spot.removed ? "old" : "new"}|${spot.line}`;
			const row = [...body.querySelectorAll<HTMLElement>("[data-line]")].find(
				(r) => r.dataset.line === key,
			);
			const text = row?.querySelector(".code-txt");
			if (!(row && text)) return null;
			const r = wordsRect(text);
			const at = after(r, 12);
			return { ...at, top: row.getBoundingClientRect().top - b.top + (row.offsetHeight - PIN) / 2 };
		}
		case "region": {
			const img = body.querySelector("img");
			if (!img) return null;
			const r = img.getBoundingClientRect();
			return {
				top: r.top - b.top + spot.y * r.height - PIN / 2,
				left: r.left - b.left + (spot.x + spot.w) * r.width - PIN / 2,
			};
		}
		case "figure":
		case "item": {
			const key = spot.kind === "figure" ? spot.label : spot.item;
			const box = [...body.querySelectorAll<HTMLElement>("[data-at]")].find(
				(e) => e.dataset.at === key,
			);
			return box ? corner(box.getBoundingClientRect()) : null;
		}
		case "range": {
			const root = body.querySelector<HTMLElement>(".mail");
			const from = root && nodeAt(root, spot.start);
			const to = root && nodeAt(root, spot.end);
			if (!(from && to)) return null;
			const range = document.createRange();
			range.setStart(...from);
			range.setEnd(...to);
			const rects = range.getClientRects();
			const last = rects[rects.length - 1];
			return last ? after(last) : null;
		}
	}
}

/** A live page in a frame, at a width. Pages that are from here can be pointed into. */
function Preview({
	url,
	width,
	onReady,
	onPoint,
}: {
	url: string;
	width?: number;
	onReady: () => void;
	onPoint: (p: Point) => void;
}) {
	const frame = useRef<HTMLIFrameElement>(null);
	const inline = url.startsWith("data:");
	const [page, setPage] = useState<string | null>(null);
	const [height, setHeight] = useState(480);
	const [reachable, setReachable] = useState(false);
	const [hover, setHover] = useState<DOMRect | null>(null);

	useEffect(() => {
		if (!inline) return;
		let current = true;
		void fetch(url)
			.then((r) => r.text())
			.then((html) => current && setPage(html));
		return () => {
			current = false;
		};
	}, [url, inline]);

	const fit = useCallback(() => {
		const doc = frame.current?.contentDocument;
		if (!doc?.body) {
			setReachable(false);
			onReady();
			return;
		}
		const style = getComputedStyle(doc.body);
		setHeight(
			Math.max(
				120,
				Math.ceil(
					doc.body.offsetHeight +
						Number.parseFloat(style.marginTop) +
						Number.parseFloat(style.marginBottom),
				),
			),
		);
		setReachable(true);
		requestAnimationFrame(onReady);
	}, [onReady]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new width lays the page out again
	useEffect(() => {
		const t = setTimeout(fit, 60);
		return () => clearTimeout(t);
	}, [width, fit]);

	const under = (e: React.MouseEvent): Element | null => {
		const f = frame.current;
		if (!f) return null;
		const r = f.getBoundingClientRect();
		return f.contentDocument?.elementFromPoint(e.clientX - r.left, e.clientY - r.top) ?? null;
	};

	return (
		<div className="preview-frame" style={{ width: width ?? "100%" }}>
			<iframe
				ref={frame}
				title="Live preview"
				style={{ height }}
				{...(inline ? { srcDoc: page ?? "" } : { src: url })}
				sandbox={inline ? "allow-same-origin" : "allow-same-origin allow-scripts allow-forms"}
				onLoad={fit}
			/>
			{reachable && (
				<button
					type="button"
					className="pin-pick"
					aria-label="Point at something on the page"
					onMouseMove={(e) => {
						const el = under(e);
						setHover(el ? el.getBoundingClientRect() : null);
					}}
					onMouseLeave={() => setHover(null)}
					onClick={(e) => {
						const el = under(e);
						if (!el) return;
						const words = el.textContent?.trim() ?? "";
						onPoint({
							spot: { kind: "element", selector: selectorOf(el) },
							label: words ? quote(words) : `the ${el.tagName.toLowerCase()}`,
						});
					}}
				/>
			)}
			{hover && (
				<span
					className="pin-pick-hi"
					style={{ top: hover.top, left: hover.left, width: hover.width, height: hover.height }}
				/>
			)}
		</div>
	);
}

function Code({
	part,
	onPoint,
}: {
	part: Extract<Part, { kind: "code" }>;
	onPoint: (p: Point) => void;
}) {
	return part.files.map((file) => (
		<div key={file.path}>
			{part.files.length > 1 && <div className="code-file">{file.path}</div>}
			{file.hunks.flatMap((hunk, h) =>
				hunk.lines.map((l, i) => {
					const removed = l.op === "del";
					const name = file.path.split("/").pop() ?? file.path;
					return (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: lines never move within a stored diff
							key={`${h}:${i}`}
							type="button"
							className={`code-line${l.op === "add" ? " code-line--add" : removed ? " code-line--del" : ""}`}
							data-line={`${file.path}|${removed ? "old" : "new"}|${l.n}`}
							onClick={() =>
								onPoint({
									spot: {
										kind: "line",
										file: file.path,
										line: l.n,
										...(removed ? { removed: true } : {}),
									},
									label: `${name}:${l.n}${removed ? " (removed)" : ""}`,
								})
							}
						>
							<span className="code-n">{l.n}</span>
							<span>{l.op === "add" ? "+" : removed ? "-" : " "}</span>
							<span className="code-txt">{l.text}</span>
						</button>
					);
				}),
			)}
		</div>
	));
}

function Text({
	part,
	onPoint,
}: {
	part: Extract<Part, { kind: "text" }>;
	onPoint: (p: Point) => void;
}) {
	const paragraphs: { start: number; text: string }[] = [];
	const re = /\n\s*\n/g;
	let start = 0;
	for (let m = re.exec(part.body); ; m = re.exec(part.body)) {
		const end = m ? m.index : part.body.length;
		paragraphs.push({ start, text: part.body.slice(start, end) });
		if (!m) break;
		start = m.index + m[0].length;
	}
	const pick = () => {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed) return;
		const a = offsetOf(sel.anchorNode, sel.anchorOffset);
		const f = offsetOf(sel.focusNode, sel.focusOffset);
		if (a === null || f === null || a === f) return;
		const [from, to] = a < f ? [a, f] : [f, a];
		sel.removeAllRanges();
		onPoint({
			spot: { kind: "range", start: from, end: to },
			label: quote(part.body.slice(from, to)),
		});
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: selecting words is how a person points at text
		<div className="mail" onMouseUp={pick}>
			{(part.to || part.subject) && (
				<div className="mail-meta">
					{part.to && (
						<span>
							<b>To</b> {part.to}
						</span>
					)}
					{part.subject && (
						<span>
							<b>Subject</b> {part.subject}
						</span>
					)}
				</div>
			)}
			{paragraphs.map((p) => (
				<p key={p.start} data-start={p.start}>
					{p.text}
				</p>
			))}
		</div>
	);
}

/** An image: drag over it to point at a region; a click points at a small one around it. */
function Image({
	part,
	onPoint,
}: {
	part: Extract<Part, { kind: "image" }>;
	onPoint: (p: Point) => void;
}) {
	const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);
	const frac = (e: React.MouseEvent<HTMLElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const clamp = (v: number) => Math.min(1, Math.max(0, v));
		return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
	};
	const box = drag && {
		x: Math.min(drag.x, drag.x2),
		y: Math.min(drag.y, drag.y2),
		w: Math.abs(drag.x2 - drag.x),
		h: Math.abs(drag.y2 - drag.y),
	};
	return (
		<button
			type="button"
			className="shot"
			aria-label="Point at a region of the image"
			onMouseDown={(e) => {
				const p = frac(e);
				setDrag({ ...p, x2: p.x, y2: p.y });
			}}
			onMouseMove={(e) => drag && setDrag({ ...drag, ...{ x2: frac(e).x, y2: frac(e).y } })}
			onMouseUp={() => {
				if (!box) return;
				const small = box.w < 0.02 || box.h < 0.02;
				const region = small
					? {
							x: Math.min(0.95, Math.max(0, box.x - 0.025)),
							y: Math.min(0.95, Math.max(0, box.y - 0.025)),
							w: 0.05,
							h: 0.05,
						}
					: box;
				setDrag(null);
				onPoint({ spot: { kind: "region", ...region }, label: "a region of the image" });
			}}
		>
			<img src={part.url} alt={part.alt ?? part.title} draggable={false} />
			{box && (
				<span
					className="region"
					style={{
						left: `${box.x * 100}%`,
						top: `${box.y * 100}%`,
						width: `${box.w * 100}%`,
						height: `${box.h * 100}%`,
					}}
				/>
			)}
		</button>
	);
}

function Content({
	part,
	width,
	onReady,
	onPoint,
}: {
	part: Part;
	width?: number;
	onReady: () => void;
	onPoint: (p: Point) => void;
}) {
	switch (part.kind) {
		case "preview":
			return <Preview url={part.url} width={width} onReady={onReady} onPoint={onPoint} />;
		case "code":
			return <Code part={part} onPoint={onPoint} />;
		case "image":
			return <Image part={part} onPoint={onPoint} />;
		case "text":
			return <Text part={part} onPoint={onPoint} />;
		case "numbers":
			return (
				<div className="kpis">
					{part.figures.map((f) => (
						<button
							type="button"
							className="kpi"
							key={f.label}
							data-at={f.label}
							onClick={() => onPoint({ spot: { kind: "figure", label: f.label }, label: f.label })}
						>
							<span className="kpi-label">{f.label}</span>
							<b>{f.value}</b>
							{f.change && (
								<span
									className={`kpi-delta${f.good === undefined ? "" : f.good ? " kpi-delta--good" : " kpi-delta--bad"}`}
								>
									{f.change}
								</span>
							)}
						</button>
					))}
				</div>
			);
		case "items":
			return (
				<div className="items">
					{part.items.map((it) => (
						<button
							type="button"
							className="item"
							key={it.id}
							data-at={it.id}
							onClick={() => onPoint({ spot: { kind: "item", item: it.id }, label: it.title })}
						>
							<b>{it.title}</b>
							<span>{it.body}</span>
						</button>
					))}
				</div>
			);
	}
}

/** The words in the part's bar, after its kind: its title, and for code how much changed. */
export function partTitle(part: Part): string {
	if (part.kind !== "code") return part.title;
	const lines = part.files.flatMap((f) => f.hunks.flatMap((h) => h.lines));
	const added = lines.filter((l) => l.op === "add").length;
	const removed = lines.filter((l) => l.op === "del").length;
	return `${part.title} · +${added} −${removed}`;
}

/**
 * The body of a part: what it shows, its pins where they point, and the open pin's thread
 * beside it. `draft` is a new pin not sent yet.
 */
export function PartBody({
	part,
	pins,
	draft,
	open,
	width,
	onOpen,
	onPoint,
	thread,
}: {
	part: Part;
	pins: readonly PinThread[];
	draft: Point | null;
	open: string | null;
	width?: number;
	onOpen: (key: string | null) => void;
	onPoint: (p: Point) => void;
	thread: (key: string) => ReactNode;
}) {
	const body = useRef<HTMLDivElement>(null);
	const [spots, setSpots] = useState<ReadonlyMap<string, At>>(new Map());
	const key = pins.map((p) => p.key).join(" ") + (draft ? JSON.stringify(draft.spot) : "");

	const measure = useCallback(() => {
		const el = body.current;
		if (!el) return;
		const width = el.getBoundingClientRect().width;
		const next = new Map<string, At>();
		const all = [...pins.map((p) => [p.key, p.pin.spot] as const)];
		if (draft) all.push(["draft", draft.spot]);
		let stacked = 0;
		for (const [k, spot] of all) {
			const at = locate(el, spot) ?? { top: 8 + PIN * 1.2 * stacked++, left: width - PIN - 8 };
			next.set(k, { top: at.top, left: Math.min(Math.max(4, at.left), width - PIN - 4) });
		}
		setSpots(next);
	}, [pins, draft]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` and `width` move the pins
	useLayoutEffect(measure, [key, width, measure]);
	useEffect(() => {
		const el = body.current;
		if (!el) return;
		const watch = new ResizeObserver(() => measure());
		watch.observe(el);
		return () => watch.disconnect();
	}, [measure]);

	const flush = part.kind === "code" || part.kind === "preview";
	const at = open ? spots.get(open) : undefined;
	const bodyWidth = body.current?.getBoundingClientRect().width ?? POP;
	return (
		<div ref={body} className={flush ? "art-body art-body--flush" : "art-body"}>
			<Content part={part} width={width} onReady={measure} onPoint={onPoint} />
			{pins.map((p) => {
				const s = spots.get(p.key);
				if (!s) return null;
				const kind = p.state === "open" ? (p.flag ? "agent" : "mine") : "done";
				return (
					<button
						key={p.key}
						id={`pin-${p.key}`}
						type="button"
						className={`pin pin--${kind}`}
						style={s}
						aria-label={`Pin ${p.mark} on ${p.pin.label}`}
						aria-expanded={open === p.key}
						onClick={() => onOpen(open === p.key ? null : p.key)}
					>
						{p.mark}
					</button>
				);
			})}
			{draft && spots.get("draft") && (
				<span className="pin pin--mine" style={spots.get("draft")}>
					+
				</span>
			)}
			{open && at && (
				<div
					className="pop"
					style={{
						top: at.top + PIN + 8,
						left: Math.max(4, Math.min(at.left, bodyWidth - POP - 4)),
					}}
				>
					{thread(open)}
				</div>
			)}
		</div>
	);
}
