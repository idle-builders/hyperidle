import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { clickableProps } from "../ds";

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
});
