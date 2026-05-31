import {
	dsShellProps,
	EmptyState,
	KeyValue,
	SearchField,
	StatusChip,
	Tag,
	betStatusToStatus,
	clickableProps,
} from "@hyperidle/design-system";
// U8: PitchCard deleted from design-system. Inline card rendering here.
// @lore U8: PitchCard was deleted from design-system as it had no reuse beyond
// PitchSelector. The pitch card rendering is now inlined in PitchSelector to
// avoid a public-API primitive that's consumed by exactly one shell component.
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
import { useRovingFocus } from "./use-roving-focus";

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

	const { getItemProps } = useRovingFocus({
		itemCount: filtered.length,
		onSelect: (index) => {
			const pitch = filtered[index];
			if (pitch) handlePitchClick(pitch.id);
		},
		onEscape: onClose,
	});

	return (
		<div
			{...dsShellProps("PitchSelector")}
			/*
			 * @lore K11: outer pad → --density-card-pad, section gap →
			 * --density-gap per density-audit.md § 3.3.K8. max-h stays
			 * literal (480 px overlay budget — must fit on a 720 px
			 * viewport). Header chrome and Add-to-canvas button stay on
			 * DaisyUI primitives (chip rule).
			 */
			className="bg-base-200 rounded-lg p-[var(--density-card-pad)] flex flex-col gap-[var(--density-gap)] max-h-[480px]"
		>
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
					<EmptyState
						title="No pitches available"
						description="Create a pitch to start shaping bets for this cycle."
						dataTestId="pitch-selector-empty"
					/>
				) : (
					filtered.map((pitch, index) => {
						const isSelected = selectedIds.includes(pitch.id);
						const rovingProps = getItemProps(index);
						return (
							<div
								key={pitch.id}
								className="relative"
								tabIndex={rovingProps.tabIndex}
								onKeyDown={rovingProps.onKeyDown}
								ref={rovingProps.ref}
							>
								{isSelected && (
									<span className="absolute top-2 right-2 text-accent text-sm font-semibold z-10">
										✓
									</span>
								)}
								{/* Inlined pitch card (PitchCard deleted from design-system in U8) */}
								<div
									{...clickableProps(
										() => handlePitchClick(pitch.id),
										"bg-[var(--surface-elevated)] rounded-[var(--r-default)] p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)] max-w-[320px] shadow-[var(--shadow-default)] border border-[var(--border-subtle)]",
									)}
								>
									<span
										className="text-[length:var(--density-text)] font-medium truncate text-[var(--text-primary)]"
										aria-label={`Pitch: ${pitch.title}`}
									>
										{pitch.title}
									</span>
									<div className="flex items-center gap-[var(--density-gap)]">
										{pitch.kind && <Tag label={pitch.kind} />}
										<StatusChip status={betStatusToStatus(pitch.status)} />
									</div>
									<p className="text-[length:var(--density-text)] text-[var(--text-secondary)] line-clamp-2">
										{pitch.hypothesis}
									</p>
									<span className="text-[12px] text-[var(--text-tertiary)]">{pitch.proposer}</span>
									<KeyValue label="Appetite" value={pitch.appetite} />
								</div>
							</div>
						);
					})
				)}
			</div>
			{activePitch && (
				<div
					data-testid="pitch-detail-pane"
					/* @lore K11: detail-pane pad → --density-card-pad per § 3.3.K8. */
					className="bg-base-300 rounded-lg p-[var(--density-card-pad)] flex flex-col gap-[var(--density-card-gap)]"
				>
					<h4 className="text-sm font-heading font-semibold uppercase tracking-wider text-[var(--text-hi)]">
						{activePitch.title}
					</h4>
					<KeyValue label="Problem" value={activePitch.problem?.trim() || "—"} layout="stacked" />
					<KeyValue label="Appetite" value={activePitch.appetite} layout="stacked" />
					<KeyValue label="Solution" value={activePitch.solution?.trim() || "—"} layout="stacked" />
					<KeyValue
						label="Rabbit holes"
						value={activePitch.rabbitHoles?.trim() || "—"}
						layout="stacked"
					/>
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
