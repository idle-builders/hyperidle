/**
 * AD3 — AC-4: SettingsNotifications solo toggle filtering.
 *
 * When solo (humanCount <= 1):
 *   - Only 2 toggles shown: "Review requests" and "Cost alerts"
 *   - "Blocker notifications" and "Email digests" are hidden
 *
 * When multi-user (humanCount > 1):
 *   - All 4 toggles are shown
 *
 * During loading (humanCount null):
 *   - Fail-open: all 4 toggles shown (graceful degradation)
 *
 * On error (humanCount null):
 *   - Fail-open: all 4 toggles shown
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useHumanCount — controlled per test
vi.mock("../useHumanCount", () => ({
	useHumanCount: vi.fn(),
}));

// Mock Toggle to keep tests focused on which toggles render
vi.mock("@hyperidle/design-system", async (importOriginal) => {
	const original = await importOriginal<typeof import("@hyperidle/design-system")>();
	return {
		...original,
		Toggle: ({ label }: { label: string; on?: boolean; onChange?: (on: boolean) => void; description?: string }) => (
			<div data-testid={`toggle-${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</div>
		),
	};
});

import { SettingsNotifications } from "../SettingsNotifications";

describe("AD3 AC-4: SettingsNotifications — solo toggle filtering", () => {
	beforeEach(async () => {
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReset();
	});

	it("shows only 2 toggles when humanCount = 1 (solo)", async () => {
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReturnValue({ humanCount: 1, loading: false });

		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.queryByText("Blocker notifications")).not.toBeInTheDocument();
		expect(screen.queryByText("Email digests")).not.toBeInTheDocument();
	});

	it("shows all 4 toggles when humanCount = 2 (multi-user)", async () => {
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReturnValue({ humanCount: 2, loading: false });

		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.getByText("Blocker notifications")).toBeInTheDocument();
		expect(screen.getByText("Email digests")).toBeInTheDocument();
	});

	it("fail-open: shows all 4 toggles during loading (humanCount = null, loading = true)", async () => {
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReturnValue({ humanCount: null, loading: true });

		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.getByText("Blocker notifications")).toBeInTheDocument();
		expect(screen.getByText("Email digests")).toBeInTheDocument();
	});

	it("fail-open: shows all 4 toggles on error (humanCount = null, loading = false)", async () => {
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReturnValue({ humanCount: null, loading: false });

		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.getByText("Blocker notifications")).toBeInTheDocument();
		expect(screen.getByText("Email digests")).toBeInTheDocument();
	});

	it("shows only 2 toggles when humanCount = 0 (no humans)", async () => {
		// 0 humans is an edge case — still considered solo (<=1)
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReturnValue({ humanCount: 0, loading: false });

		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.queryByText("Blocker notifications")).not.toBeInTheDocument();
		expect(screen.queryByText("Email digests")).not.toBeInTheDocument();
	});

	it("shows all 4 toggles when humanCount = 10 (large team)", async () => {
		const { useHumanCount } = await import("../useHumanCount");
		vi.mocked(useHumanCount).mockReturnValue({ humanCount: 10, loading: false });

		render(<SettingsNotifications />);

		expect(screen.getByText("Review requests")).toBeInTheDocument();
		expect(screen.getByText("Cost alerts")).toBeInTheDocument();
		expect(screen.getByText("Blocker notifications")).toBeInTheDocument();
		expect(screen.getByText("Email digests")).toBeInTheDocument();
	});
});
