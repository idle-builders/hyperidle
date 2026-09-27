// design-lint-disable require-stories-sibling

import type { JSX } from "react";
import type { InlineNode } from "../../block/types.js";

import { renderInline } from "./inline.js";

export interface TablePayloadProps {
	align: ("left" | "right" | "center" | null)[];
	header: InlineNode[][];
	rows: InlineNode[][][];
}

export function TablePayload({ align, header, rows }: TablePayloadProps): JSX.Element {
	return (
		<div className="border-width-thin overflow-x-auto rounded-[var(--r-default)]  border-[var(--border-subtle)]">
			<table className="type-small w-full border-collapse ">
				<thead className="sticky top-0 bg-[var(--surface-container)]">
					<tr>
						{header.map((cell, i) => (
							<th
								// biome-ignore lint/suspicious/noArrayIndexKey: a parsed markdown table is immutable content re-rendered from scratch each time, never reordered.
								key={i}
								scope="col"
								style={{ textAlign: align[i] ?? "left" }}
								className="type-label border-width-thin-b   uppercase  text-[var(--text-secondary)] px-[12px] py-[9px]  border-[var(--border-subtle)]"
							>
								{renderInline(cell)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, ri) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a parsed markdown table is immutable content re-rendered from scratch each time, never reordered.
						<tr key={ri}>
							{row.map((cell, ci) => (
								<td
									// biome-ignore lint/suspicious/noArrayIndexKey: a parsed markdown table is immutable content re-rendered from scratch each time, never reordered.
									key={ci}
									style={{ textAlign: align[ci] ?? "left" }}
									className="border-width-thin-b px-[12px] py-[9px]  border-[var(--border-subtle)] tabular-nums"
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
