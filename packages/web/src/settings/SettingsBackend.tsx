/**
 * SettingsBackend — Backend settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12)
 * Manages backend mode and connection settings.
 * Primarily exposed for founders using the shared backend.
 */

import type { JSX } from "react";

export function SettingsBackend(): JSX.Element {
	return (
		<div className="flex flex-col gap-3">
			<p className="text-sm text-[var(--text-mid)]">
				Backend configuration is set during initial setup. To change the backend mode, contact your
				administrator or run the setup flow again.
			</p>
		</div>
	);
}
