/**
 * SettingsCredentials — Credentials settings section.
 *
 * P4 Task 10: Settings section stubs (AC-12, AC-16)
 * Delegates to the existing CredentialsTab component for backward-compat.
 */

import type { JSX } from "react";
import { CredentialsTab } from "../components/CredentialsTab.js";

export function SettingsCredentials(): JSX.Element {
	return <CredentialsTab />;
}
