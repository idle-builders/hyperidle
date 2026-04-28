import type { ArtifactCostFromSession } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactCostChipProps {
	cost: ArtifactCostFromSession;
	variant?: "compact" | "full";
}

const CHIP_BASE =
	"inline-flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-mid)] [font-variant-numeric:tabular-nums]";

const EM_DASH = "—";

export function ArtifactCostChip({ cost, variant = "full" }: ArtifactCostChipProps): JSX.Element {
	const moneyText = cost.money ?? EM_DASH;
	const showTokens = variant === "full" && cost.tokens !== null;
	return (
		<span {...dsProps("ArtifactCostChip", "1")} className={CHIP_BASE}>
			<span>{moneyText}</span>
			{showTokens ? (
				<>
					<span className="text-[var(--text-lo)]">·</span>
					<span>{cost.tokens}</span>
				</>
			) : null}
		</span>
	);
}
