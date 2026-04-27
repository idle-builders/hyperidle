import type { JSX } from "react";
import { OfflineBanner } from "./OfflineBanner";

export function OfflineBannerOffline(): JSX.Element {
	return (
		<div className="w-[390px]">
			<OfflineBanner offline={true} syncedCount={null} />
		</div>
	);
}

export function OfflineBannerSyncedSingle(): JSX.Element {
	return (
		<div className="relative h-40 w-[390px]">
			<OfflineBanner offline={false} syncedCount={1} onDismissSyncedToast={() => {}} />
		</div>
	);
}

export function OfflineBannerSyncedMultiple(): JSX.Element {
	return (
		<div className="relative h-40 w-[390px]">
			<OfflineBanner offline={false} syncedCount={3} onDismissSyncedToast={() => {}} />
		</div>
	);
}

export function OfflineBannerHidden(): JSX.Element {
	return (
		<div className="w-[390px] text-xs text-[var(--text-lo)] p-2">
			(Online + no synced toast — banner renders nothing.)
			<OfflineBanner offline={false} syncedCount={null} />
		</div>
	);
}
