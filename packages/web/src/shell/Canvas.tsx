// @lore Canvas uses @dnd-kit/core for drag-drop instead of deprecated react-beautiful-dnd.
// The DnD context wraps both columns; onDragEnd maps over.id to the target column.
// BetCard is reused from Tier 2. Only "shaped" and "committed" statuses appear here.
// @lore UI_DESIGN.md says 4 lanes but HUMAN_INTERFACE_LAYER.md Section 4.3 says 2 columns
// (Shaped + Committed). We follow HUMAN_INTERFACE_LAYER.md as the more detailed spec.
import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { BetCard, dsShellProps, EmptyState } from "@hyperidle/design-system";
import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { CocAttachButton } from "../components/CocAttachButton";

export interface CanvasBet {
	id: string;
	title: string;
	product: string;
	/** @lore Q3: productId added for canvas bet creation — the dialog needs it to POST the new bet. */
	productId?: string;
	status: BetStatus;
	appetite: string;
	progress?: { done: number; total: number };
}

export interface CanvasProps {
	bets: CanvasBet[];
	capacity: number;
	onMoveBet: (betId: string, targetStatus: "shaped" | "committed") => void;
	/**
	 * @lore Q3 T6: when supplied, a '+' button appears in the Shaped column header.
	 * When absent, the button is not rendered (design critique W-1: no phantom controls).
	 */
	onNewPitch?: () => void;
}

type CanvasColumn = "shaped" | "committed";

const COLUMNS: { key: CanvasColumn; label: string }[] = [
	{ key: "shaped", label: "Shaped" },
	{ key: "committed", label: "Committed" },
];

function DroppableColumn({
	columnKey,
	label,
	children,
	capacityBadge,
	warning,
	headerAction,
}: {
	columnKey: string;
	label: string;
	children: React.ReactNode;
	capacityBadge?: { text: string; over: boolean };
	warning?: string;
	/** Optional action rendered in the column header (e.g. the '+' button). */
	headerAction?: React.ReactNode;
}): JSX.Element {
	return (
		<div className="flex-1 min-w-0 flex flex-col gap-2">
			<div className="flex items-center gap-2 mb-1">
				<h3 className="text-sm font-semibold">{label}</h3>
				{/* J5: capacity badge is the prominent commitment signal. We
				    drop the `badge-ghost` faded style in favour of a solid
				    neutral chip, switching to `badge-error` when over
				    capacity so the "N / C" read-out carries the error
				    semantics too. */}
				{capacityBadge && (
					<span
						data-testid="canvas-capacity-badge"
						className={`badge badge-sm font-mono ${
							capacityBadge.over ? "badge-error" : "badge-neutral"
						}`}
					>
						{capacityBadge.text}
					</span>
				)}
				{warning && <span className="text-xs text-error font-semibold">{warning}</span>}
				{headerAction && <div className="ml-auto">{headerAction}</div>}
			</div>
			{children}
		</div>
	);
}

function DraggableBetCard({ bet }: { bet: CanvasBet }): JSX.Element {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: bet.id });
	return (
		<div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.4 : 1 }}>
			<BetCard
				title={bet.title}
				product={bet.product}
				status={bet.status}
				appetite={bet.appetite}
				progress={bet.progress}
				actions={
					// L21 T12: CoC attach affordance — shown only when overlay is open.
					<CocAttachButton ref={{ kind: "bet", id: bet.id, label: bet.title }} />
				}
			/>
		</div>
	);
}

export function Canvas({ bets, capacity, onMoveBet, onNewPitch }: CanvasProps): JSX.Element {
	const [activeId, setActiveId] = useState<string | null>(null);

	// I4 KB1: KeyboardSensor enables drag-drop via keyboard (Space to pick
	// up, arrows to move, Space to drop) so the Canvas is a11y-complete.
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor),
	);

	const shaped = useMemo(() => bets.filter((b) => b.status === "shaped"), [bets]);
	const committed = useMemo(() => bets.filter((b) => b.status === "committed"), [bets]);

	const activeBet = activeId ? bets.find((b) => b.id === activeId) : undefined;
	const overCapacity = committed.length > capacity;

	function handleDragStart(event: DragStartEvent): void {
		setActiveId(String(event.active.id));
	}

	function handleDragEnd(event: DragEndEvent): void {
		setActiveId(null);
		const { active, over } = event;
		if (!over) return;

		const overId = String(over.id);
		const targetColumn: CanvasColumn | undefined =
			overId === "shaped" || overId === "committed" ? overId : undefined;
		if (targetColumn) {
			onMoveBet(String(active.id), targetColumn);
		}
	}

	const shellAttrs = dsShellProps("Canvas");

	/** @lore Q3 W-1: btn-sm gives ~32px height with extra min-h to meet AQ-015 44px touch target floor. */
	const newPitchButton = onNewPitch ? (
		<button
			type="button"
			className="btn btn-sm btn-ghost min-h-[44px] min-w-[44px]"
			aria-label="New pitch"
			onClick={onNewPitch}
		>
			+
		</button>
	) : null;

	if (bets.length === 0) {
		// @lore K2: wrapper div carries the Canvas shell marker even when empty.
		// @lore Q3: even in the empty state, the shaped column header action (+) is rendered
		// so founders can create the first bet without navigating away.
		return (
			<div {...shellAttrs}>
				{newPitchButton && (
					<div className="flex items-center gap-2 mb-2">
						<h3 className="text-sm font-semibold">Shaped</h3>
						<div className="ml-auto">{newPitchButton}</div>
					</div>
				)}
				<EmptyState
					title="No bets yet"
					description="Shaped bets will appear here once they are created. Drag between columns to commit."
					dataTestId="canvas-empty"
				/>
			</div>
		);
	}

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			{/*
			 * @lore K11: column gap → --density-gap per density-audit.md
			 * § 3.3.K6. Drop-zone min-h (48 px) and inner pad (p-1) stay
			 * literal — DnD primitives. Column header `text-sm` stays
			 * literal (chrome shared with Kanban). BetCard children inherit
			 * density via the BetCard primitive itself.
			 */}
			<div {...shellAttrs} className="flex gap-[var(--density-gap)]">
				{COLUMNS.map((col) => {
					const columnBets = col.key === "shaped" ? shaped : committed;
					const capacityBadge =
						col.key === "committed"
							? {
									text: `${committed.length} / ${capacity}`,
									over: overCapacity,
								}
							: undefined;
					const warning = col.key === "committed" && overCapacity ? "Over capacity" : undefined;

					return (
						<DroppableColumn
							key={col.key}
							columnKey={col.key}
							label={col.label}
							capacityBadge={capacityBadge}
							warning={warning}
							headerAction={col.key === "shaped" ? newPitchButton : undefined}
						>
							<CanvasDropZone columnKey={col.key}>
								{columnBets.map((bet) => (
									<DraggableBetCard key={bet.id} bet={bet} />
								))}
							</CanvasDropZone>
						</DroppableColumn>
					);
				})}
			</div>
			<DragOverlay>
				{activeBet ? (
					<BetCard
						title={activeBet.title}
						product={activeBet.product}
						status={activeBet.status}
						appetite={activeBet.appetite}
						progress={activeBet.progress}
					/>
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

// @lore Using useDroppable from @dnd-kit requires the hook inside a DndContext child.
// We split it into a separate component to satisfy the hook-in-component rule.
function CanvasDropZone({
	columnKey,
	children,
}: {
	columnKey: string;
	children: React.ReactNode;
}): JSX.Element {
	const { setNodeRef, isOver } = useDroppable({ id: columnKey });
	return (
		<div
			ref={setNodeRef}
			data-droppable={columnKey}
			className={`flex flex-col gap-2 min-h-[48px] rounded p-1 transition-colors ${
				isOver ? "bg-accent/10" : ""
			}`}
		>
			{children}
		</div>
	);
}
