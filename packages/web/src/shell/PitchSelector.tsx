/**
 * @lore J5: PitchSelector now hosts an inline detail pane. Clicking a
 * pitch both toggles selection (preserved for existing tests) AND sets
 * the active detail. The "Add to canvas" action is gated to the detail
 * pane — it never appears on the individual cards. This matches the
 * J5 spec: "PitchSelector replaces Kanban when open (existing overlay
 * pattern). Detail pane internal to PitchSelector, not a separate route."
 */
import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { PitchCard, SearchField } from "@hyperidle/design-system";

export interface PitchSelectorPitch {
	id: string;
	title: string;
	hypothesis: string;
	proposer: string;
	status: BetStatus;
	appetite: string;
	kind?: string;
	problem?: string;
	solution?: string;
	rabbitHoles?: string;
}

export interface PitchSelectorProps {
	pitches: PitchSelectorPitch[];
	selectedIds: string[];
	onSelect: (pitchId: string) => void;
	onClose: () => void;
	onAddToCanvas?: (pitchId: string) => void;
}

export function PitchSelector({
	pitches,
	selectedIds,
	onSelect,
	onClose,
	onAddToCanvas,
}: PitchSelectorProps): JSX.Element {
	const [search, setSearch] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);

	const filtered = useMemo(() => {
		if (!search.trim()) return pitches;
		const q = search.toLowerCase();
		return pitches.filter(
			(p) =>
				p.title.toLowerCase().includes(q) ||
				p.hypothesis.toLowerCase().includes(q) ||
				p.proposer.toLowerCase().includes(q),
		);
	}, [pitches, search]);

	const activePitch = activeId ? pitches.find((p) => p.id === activeId) : undefined;

	function handlePitchClick(pitchId: string): void {
		setActiveId(pitchId);
		onSelect(pitchId);
	}

	return (
		<div className="bg-base-200 rounded p-3 flex flex-col gap-3 max-h-[480px]">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">Select Pitch</h3>
				<button
					type="button"
					className="btn btn-ghost btn-xs"
					aria-label="Close pitch selector"
					onClick={onClose}
				>
					&#x2715;
				</button>
			</div>
			<SearchField placeholder="Search pitches…" value={search} onChange={setSearch} />
			<div className="flex flex-col gap-2 overflow-y-auto">
				{filtered.length === 0 ? (
					<div className="text-xs text-[var(--text-lo)] p-2 text-center">No pitches available</div>
				) : (
					filtered.map((pitch) => {
						const isSelected = selectedIds.includes(pitch.id);
						return (
							<div key={pitch.id} className="relative">
								{isSelected && (
									<span className="absolute top-2 right-2 text-accent text-sm font-bold z-10">
										✓
									</span>
								)}
								<PitchCard
									title={pitch.title}
									hypothesis={pitch.hypothesis}
									proposer={pitch.proposer}
									status={pitch.status}
									appetite={pitch.appetite}
									kind={pitch.kind}
									onClick={() => handlePitchClick(pitch.id)}
								/>
							</div>
						);
					})
				)}
			</div>
			{activePitch && (
				<div
					data-testid="pitch-detail-pane"
					className="bg-base-300 rounded p-3 flex flex-col gap-2"
				>
					<h4 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-hi)]">
						{activePitch.title}
					</h4>
					<PitchDetailRow label="Problem" value={activePitch.problem} />
					<PitchDetailRow label="Appetite" value={activePitch.appetite} />
					<PitchDetailRow label="Solution" value={activePitch.solution} />
					<PitchDetailRow label="Rabbit holes" value={activePitch.rabbitHoles} />
					<div className="flex justify-end">
						<button
							type="button"
							className="btn btn-primary btn-xs"
							onClick={() => onAddToCanvas?.(activePitch.id)}
							disabled={!onAddToCanvas}
						>
							Add to canvas
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function PitchDetailRow({
	label,
	value,
}: {
	label: string;
	value: string | undefined;
}): JSX.Element {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="uppercase font-heading text-xs tracking-wider text-[var(--text-lo)]">
				{label}
			</span>
			<span className="text-sm text-[var(--text-hi)] whitespace-pre-wrap">
				{value && value.trim() !== "" ? value : "—"}
			</span>
		</div>
	);
}
