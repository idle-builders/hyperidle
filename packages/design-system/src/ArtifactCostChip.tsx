import type { ArtifactCostFromSession } from "@hyperidle/shared";
import { formatMoney, formatTokenCount, totalTokens } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactCostChipProps {
	cost: ArtifactCostFromSession;
	variant?: "compact" | "full";
}

const CHIP_BASE =
	"inline-flex items-center gap-[6px] font-mono text-[11px] text-[var(--text-mid)] [font-variant-numeric:tabular-nums]";

export function ArtifactCostChip({ cost, variant = "full" }: ArtifactCostChipProps): JSX.Element {
	// @lore L17: show em dash (—) when money is null — this is the "pending / not recorded" signal.
	// formatMoney(null) returns "--" which is correct for plain text, but the component uses the
	// typographic em dash per AC-7 (cost-cell-em-dash design rule).
	const moneyText = cost.money === null ? "—" : formatMoney(cost.money);

	// Calculate total token count from TokenUsage
	let tokenText: string | null = null;
	if (variant === "full" && cost.tokens !== null) {
		const totals = totalTokens(cost.tokens);
		const total = totals.prompt + totals.completion;
		tokenText = formatTokenCount(total);
	}

	const showTokens = variant === "full" && tokenText !== null;

	return (
		<span {...dsProps("ArtifactCostChip", "1")} className={CHIP_BASE}>
			<span>{moneyText}</span>
			{showTokens ? (
				<>
					<span className="text-[var(--text-lo)]">·</span>
					<span>{tokenText}</span>
				</>
			) : null}
		</span>
	);
}
