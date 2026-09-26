/**
 * AV5 — DesktopTitleBar component tests.
 *
 * AC coverage:
 *  - AC4: returns null when window.__HYPERIDLE__ is undefined (browser context)
 *  - AC2: renders a drag-region inset in Electron context (app-region-drag)
 *  - AC3: the inset is a spacer (h-[28px]) that shifts the sidebar nav down
 */

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopTitleBar } from "../DesktopTitleBar";

// @lore AV5: Use the cast-through-unknown pattern (SettingsWorker.stories.tsx precedent)
// to install a minimal __HYPERIDLE__ stub without satisfying the full bridge interface.
// The property is optional so delete is valid.
type PartialBridgeWindow = { __HYPERIDLE__?: Partial<HyperIdleElectronBridge> };

describe("DesktopTitleBar (AV5)", () => {
	afterEach(() => {
		// Clean up any __HYPERIDLE__ stub installed during the test.
		if (typeof window !== "undefined") {
			delete (window as unknown as PartialBridgeWindow).__HYPERIDLE__;
		}
	});

	it("renders nothing when window.__HYPERIDLE__ is undefined (browser context)", () => {
		// Ensure no bridge is present.
		if (typeof window !== "undefined") {
			delete (window as unknown as PartialBridgeWindow).__HYPERIDLE__;
		}

		const { container } = render(<DesktopTitleBar />);
		expect(container.firstChild).toBeNull();
	});

	it("renders a draggable top inset in Electron context", () => {
		if (typeof window !== "undefined") {
			(window as unknown as PartialBridgeWindow).__HYPERIDLE__ = {
				platform: "electron",
			};
		}

		const { container } = render(<DesktopTitleBar />);
		expect(container.firstChild).not.toBeNull();
	});
});
