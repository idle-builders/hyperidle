// design-lint-disable require-stories-sibling
import type { InlineNode } from "@hyperidle/shared";
import type { JSX } from "react";

import { renderInline } from "./inline.js";

export interface TablePayloadProps {
	align: ("left" | "right" | "center" | null)[];
	header: InlineNode[][];
	rows: InlineNode[][][];
}

export function TablePayload({ align, header, rows }: TablePayloadProps): JSX.Element {
	return (
		<div className="overflow-x-auto rounded-[var(--r-default)] border border-[var(--border-subtle)]">
			<table className="w-full border-collapse text-[13px]">
				<thead className="sticky top-0 bg-[var(--surface-container)]">
					<tr>
						{header.map((cell, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: table header columns have no stable id; column position is their identity
							<th key={i}
								scope="col"
								style={{ textAlign: align[i] ?? "left" }}
								className="font-mono text-[11px] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-secondary)] px-[12px] py-[9px] border-b border-[var(--border-subtle)]"
							>
								{renderInline(cell)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, ri) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: table rows have no stable id; row position is their identity
						<tr key={ri}>
							{row.map((cell, ci) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: table cells have no stable id; column position is their identity
								<td key={ci}
									style={{ textAlign: align[ci] ?? "left" }}
									className="px-[12px] py-[9px] border-b border-[var(--border-subtle)] tabular-nums"
								>
									{renderInline(cell)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
