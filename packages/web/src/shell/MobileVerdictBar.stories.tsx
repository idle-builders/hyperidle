import type { VerdictAction } from "@hyperidle/shared";
import type { JSX } from "react";
import { useState } from "react";
import { MobileVerdictBar } from "./MobileVerdictBar";

export function MobileVerdictBarIdle(): JSX.Element {
	const [pending, setPending] = useState<VerdictAction | null>(null);
	return (
		<div className="relative h-40 w-[390px] border border-[var(--border-subtle)] bg-base-100">
			<MobileVerdictBar
				pendingVerdict={pending}
				verdictDoubleClick={true}
				onPrefill={setPending}
				onCommit={() => setPending(null)}
				onMore={() => {}}
			/>
		</div>
	);
}

export function MobileVerdictBarPendingApprove(): JSX.Element {
	const [pending, setPending] = useState<VerdictAction | null>("approve");
	return (
		<div className="relative h-40 w-[390px] border border-[var(--border-subtle)] bg-base-100">
			<MobileVerdictBar
				pendingVerdict={pending}
				verdictDoubleClick={true}
				onPrefill={setPending}
				onCommit={() => setPending(null)}
				onMore={() => {}}
			/>
		</div>
	);
}
