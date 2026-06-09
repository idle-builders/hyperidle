/**
 * AD8b — SettingsAssistant stories.
 */

import type { JSX } from "react";
import { SettingsAssistant } from "./SettingsAssistant.js";

export default {
	title: "Settings/SettingsAssistant",
	component: SettingsAssistant,
};

export function Default(): JSX.Element {
	return <SettingsAssistant userId="u-demo" />;
}

export function WithExistingPrompt(): JSX.Element {
	return <SettingsAssistant userId="u-demo-2" />;
}
