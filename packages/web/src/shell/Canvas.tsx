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
import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { BetCard } from "../components/BetCard";

export interface CanvasBet {
	id: string;
	title: string;
	product: string;
	status: BetStatus;
	appetite: string;
	progress?: { done: number; total: number };
}

export interface CanvasProps {
	bets: CanvasBet[];
	capacity: number;
	onMoveBet: (betId: string, targetStatus: "shaped" | "committed") => void;
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
}: {
	columnKey: string;
	label: string;
	children: React.ReactNode;
	capacityBadge?: { text: string; over: boolean };
	warning?: string;
}): JSX.Element {
	return (
		<div className="flex-1 min-w-0 flex flex-col gap-2" data-droppable={columnKey}>
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
			</div>
			<div className="flex flex-col gap-2 min-h-[48px]">{children}</div>
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
			/>
		</div>
	);
}

export function Canvas({ bets, capacity, onMoveBet }: CanvasProps): JSX.Element {
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

	if (bets.length === 0) {
		return (
			<div className="flex items-center justify-center p-8 text-[var(--text-lo)] text-sm">
				No bets yet
			</div>
		);
	}

	return (
		<DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
			<div className="flex gap-4">
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
			className={`flex flex-col gap-2 min-h-[48px] rounded p-1 transition-colors ${
				isOver ? "bg-accent/10" : ""
			}`}
		>
			{children}
		</div>
	);
}
