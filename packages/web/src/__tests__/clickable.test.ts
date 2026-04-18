import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { clickableProps } from "../components/clickable";

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
			const cls = (result as { className?: string }).className ?? "";
			expect(cls).toContain("cursor-pointer");
		});

		it("returned className includes focus-visible:ring-1 focus-visible:ring-primary", () => {
			// I4 KB2: focus-visible ring so keyboard users see the focused
			// element. These are composable Tailwind utilities and must come
			// from clickableProps (single source of truth).
			const result = clickableProps(() => {});
			const cls = (result as { className?: string }).className ?? "";
			expect(cls).toContain("focus-visible:ring-1");
			expect(cls).toContain("focus-visible:ring-primary");
		});

		it("merges caller-provided className with the default focus utilities", () => {
			// I4 KB2: helper accepts an optional caller className and merges.
			// Uses a widened signature cast because the current source accepts
			// only one argument — the 2-arg call must be supported post-I4.
			const widened = clickableProps as unknown as (
				onClick?: () => void,
				callerClassName?: string,
			) => { className?: string };
			const result = widened(() => {}, "bg-base-200 p-2");
			const cls = result.className ?? "";
			expect(cls).toContain("bg-base-200");
			expect(cls).toContain("p-2");
			expect(cls).toContain("cursor-pointer");
			expect(cls).toContain("focus-visible:ring-1");
			expect(cls).toContain("focus-visible:ring-primary");
		});

		it("empty-result branch (no onClick) does NOT emit the focus utilities", () => {
			// When there is no handler, nothing is clickable — helper returns {}.
			const result = clickableProps(undefined);
			expect((result as { className?: string }).className).toBeUndefined();
		});
	});
});
