// design-lint-disable require-stories-sibling
import type { JSX } from "react";

export function DividerPayload(): JSX.Element {
	return (
		<hr className="border-t-[var(--bw-thin)] border-none my-[12px]   border-[var(--border-subtle)]" />
	);
}
