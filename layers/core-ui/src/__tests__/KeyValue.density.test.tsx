import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyValue } from "../ds";

/**
 * @lore J1: KeyValue font-size tests.
 * @lore W2: Density tokens stripped. text-[length:var(--density-text)] replaced with
 * text-[15px] (Hearth base size). The old density-aware test is updated to reflect
 * literal pixel values per W2 architecture.md density replacement table.
 * W2 review D1: Removed redundant text-[14px] fallback class — text-[15px] is the
 * single source of truth. The px-fallback was a workaround for 14px-base viewers
 * that is no longer needed now that density tokens are fully stripped.
 */
describe("KeyValue — font-size (W2: literal Hearth values)", () => {
	it("value carries the copy profile", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).toHaveClass("type-copy");
	});

	it("value does not carry stale text-[14px] fallback class", () => {
		// D1: The px-fallback class was removed — text-[15px] is the only size class.
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).not.toHaveClass("text-[14px]");
		expect(value).toHaveClass("type-copy");
	});
});
