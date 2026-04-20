import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyValue } from "@hyperidle/design-system";

/**
 * @lore J1: KeyValue must emit the density-aware font-size class so the appearance
 * setting changes information density on surfaces that use KeyValue (Rail Cost
 * section, etc.). The pre-existing KeyValue.test.tsx still asserts `text-sm` is
 * present (for back-compat); this file proves the NEW density-wiring behavior
 * without modifying the original test file.
 */
describe("KeyValue — density wiring (J1)", () => {
	it("value carries text-[length:var(--density-text)] so font-size tracks density token", () => {
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).toHaveClass("text-[length:var(--density-text)]");
	});

	it("value keeps text-sm alongside the density arbitrary-value class", () => {
		// Guards against accidental removal of the back-compat class used by the
		// original KeyValue.test.tsx assertion.
		render(<KeyValue label="Owner" value="Alice" />);
		const value = screen.getByText("Alice");
		expect(value).toHaveClass("text-sm");
		expect(value).toHaveClass("text-[length:var(--density-text)]");
	});
});
