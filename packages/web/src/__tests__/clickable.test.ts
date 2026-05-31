import { clickableProps } from "@hyperidle/design-system";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

describe("clickableProps", () => {
	it("returns empty object when onClick is undefined", () => {
		const result = clickableProps(undefined);
		expect(result).toEqual({});
	});

	it("returns role, onClick, onKeyDown, tabIndex when onClick is provided", () => {
		const handler = vi.fn();
		const result = clickableProps(handler);
		expect(result).toHaveProperty("role", "button");
		expect(result).toHaveProperty("onClick", handler);
		expect(result).toHaveProperty("onKeyDown");
		expect(result).toHaveProperty("tabIndex", 0);
	});

	it("onKeyDown calls handler on Enter key", () => {
		const handler = vi.fn();
		const result = clickableProps(handler);
		const { onKeyDown } = result;
		const preventDefault = vi.fn();
		onKeyDown?.({ key: "Enter", preventDefault } as unknown as React.KeyboardEvent<HTMLDivElement>);
		expect(handler).toHaveBeenCalledOnce();
		expect(preventDefault).toHaveBeenCalledOnce();
	});

	it("onKeyDown calls handler on Space key", () => {
		const handler = vi.fn();
		const result = clickableProps(handler);
		const { onKeyDown } = result;
		const preventDefault = vi.fn();
		onKeyDown?.({ key: " ", preventDefault } as unknown as React.KeyboardEvent<HTMLDivElement>);
		expect(handler).toHaveBeenCalledOnce();
		expect(preventDefault).toHaveBeenCalledOnce();
	});

	it("onKeyDown does not call handler on other keys", () => {
		const handler = vi.fn();
		const result = clickableProps(handler);
		const { onKeyDown } = result;
		const preventDefault = vi.fn();
		onKeyDown?.({
			key: "Escape",
			preventDefault,
		} as unknown as React.KeyboardEvent<HTMLDivElement>);
		expect(handler).not.toHaveBeenCalled();
		expect(preventDefault).not.toHaveBeenCalled();
	});

	describe("className (I4 KB2)", () => {
		it("returned className includes cursor-pointer", () => {
			const result = clickableProps(() => {});
			expect(result.className ?? "").toContain("cursor-pointer");
		});

		it("returned className includes focus-visible outline utilities (Hearth pattern)", () => {
			// I4 KB2: focus-visible outline so keyboard users see the focused
			// element. These are composable Tailwind utilities and must come
			// from clickableProps (single source of truth).
			const result = clickableProps(() => {});
			const cls = result.className ?? "";
			expect(cls).toContain("focus-visible:outline");
			expect(cls).toContain("focus-visible:outline-[var(--accent-primary)]");
		});

		it("merges caller-provided className with the default focus utilities", () => {
			// I4 KB2: helper accepts an optional caller className and merges.
			const result = clickableProps(() => {}, "bg-base-200 p-2");
			const cls = result.className ?? "";
			expect(cls).toContain("bg-base-200");
			expect(cls).toContain("p-2");
			expect(cls).toContain("cursor-pointer");
			expect(cls).toContain("focus-visible:outline");
			expect(cls).toContain("focus-visible:outline-[var(--accent-primary)]");
		});

		it("empty-result branch (no onClick) does NOT emit the focus utilities", () => {
			// When there is no handler, nothing is clickable — helper returns {}.
			const result = clickableProps(undefined);
			expect(result.className).toBeUndefined();
		});
	});
});
