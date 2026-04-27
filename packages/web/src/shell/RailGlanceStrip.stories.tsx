import type { JSX } from "react";
import { RailGlanceStrip } from "./RailGlanceStrip";

export function RailGlanceStripDefault(): JSX.Element {
	return (
		<div className="w-[390px]">
			<RailGlanceStrip
				blockingCount={3}
				burnLabel="$28.40"
				anomaliesCount={0}
				onExpand={() => {}}
			/>
		</div>
	);
}

export function RailGlanceStripWithAnomalies(): JSX.Element {
	return (
		<div className="w-[390px]">
			<RailGlanceStrip
				blockingCount={1}
				burnLabel="$142.10"
				anomaliesCount={2}
				onExpand={() => {}}
			/>
		</div>
	);
}

export function RailGlanceStripQuiet(): JSX.Element {
	return (
		<div className="w-[390px]">
			<RailGlanceStrip blockingCount={0} burnLabel="$3.20" anomaliesCount={0} onExpand={() => {}} />
		</div>
	);
}
