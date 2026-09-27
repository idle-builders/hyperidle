/**
 * Stories for DesktopTitleBar (AV5).
 *
 * Design artifact — renders the sidebar drag inset at /designsystem.
 * Two stories: browser context (null render) and Electron context (28px drag inset).
 *
 * @lore AV5: window.__HYPERIDLE__ is injected using the cast-through-unknown
 * pattern from SettingsWorker.stories.tsx — partial stub avoids implementing
 * the full HyperIdleElectronBridge interface.
 */

import { useMemo } from "react";
import { useStoryHyperIdleBridge } from "../__storybook__/use-story-globals.js";
import { DesktopTitleBar } from "./DesktopTitleBar";

export default {
	title: "DesktopTitleBar",
	tier: "3" as const,
};

/**
 * Browser context — component returns null; no strip, no height, no layout shift.
 */
export const BrowserContext = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(null);
	if (!bridgeInstalled) return null;
	return (
		<div className="bg-[var(--surface-page)] h-[100px] w-full flex items-start justify-center text-[var(--text-secondary)] text-[13px] pt-[12px]">
			(No strip renders — DesktopTitleBar returns null in browser context)
		</div>
	);
};

/**
 * Electron context — 28px drag inset at the top of the sidebar column.
 * The OS traffic-light controls float inside this strip at x:12, y:11.
 * Main content (right column) is unaffected — reaches the window top.
 */
export const ElectronContext = (): React.JSX.Element | null => {
	const bridgeInstalled = useStoryHyperIdleBridge(
		useMemo(() => ({ platform: "electron" as const }), []),
	);
	if (!bridgeInstalled) return null;
	return (
		<div className="bg-[var(--surface-container)] w-[200px] flex flex-col">
			<DesktopTitleBar />
			<div className="h-[200px] flex items-center justify-center text-[var(--text-secondary)] text-[13px]">
				Sidebar nav starts here — below the 28px drag inset
			</div>
		</div>
	);
};
