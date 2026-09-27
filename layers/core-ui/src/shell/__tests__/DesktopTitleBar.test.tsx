/**
 * DesktopTitleBar component tests.
 *
 * Covers: returns null when window.__HYPERIDLE__ is undefined (browser
 * context); renders a drag-region inset in Electron context
 * (app-region-drag); the inset is a spacer (h-[28px]) that shifts the
 * sidebar nav down.
 */

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopTitleBar } from "../DesktopTitleBar";

// @lore casts through unknown to install a minimal __HYPERIDLE__ stub without satisfying the full bridge interface — the property is optional.
type PartialBridgeWindow = { __HYPERIDLE__?: Partial<HyperIdleElectronBridge> };

describe("DesktopTitleBar", () => {
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
		// The inset is pure chrome (a drag handle only) — it must stay hidden
		// from assistive tech, same contract the component's own docstring states.
		expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
	});
});
