// design-lint-disable require-stories-sibling
import type { JSX } from "react";

export function DividerPayload(): JSX.Element {
	return <hr className="my-[12px] border-0 border-t border-[var(--border-subtle)]" />;
}
