import type { BetStatus } from "@hyperidle/shared";
import { type JSX, useMemo, useState } from "react";
import { PitchCard } from "../components/PitchCard";
import { SearchField } from "../components/SearchField";

export interface PitchSelectorPitch {
	id: string;
	title: string;
	hypothesis: string;
	proposer: string;
	status: BetStatus;
	appetite: string;
	kind?: string;
}

export interface PitchSelectorProps {
	pitches: PitchSelectorPitch[];
	selectedIds: string[];
	onSelect: (pitchId: string) => void;
	onClose: () => void;
}

export function PitchSelector({
	pitches,
	selectedIds,
	onSelect,
	onClose,
}: PitchSelectorProps): JSX.Element {
	const [search, setSearch] = useState("");

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
									onClick={() => onSelect(pitch.id)}
								/>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
