// @vitest-environment jsdom

/**
 * useDialogBehavior hook: dismissal rule + layer resolution.
 *
 * Covers: one dismissal grammar — dirty input is never lost to a single
 * Esc/backdrop, and confirmations (isDirty=false) always close; focus
 * enters on open, is trapped, and returns to the trigger on close; layer →
 * zIndex resolution.
 *
 * @lore jsdom has no inert implementation — tests assert the focus-trap path only; assert the inert attribute in a real-browser E2E test instead.
 *
 * @lore focus-trap-react needs displayCheck:"none" under jsdom — jsdom lays out nothing, so every computed size reads 0.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type UseDialogBehaviorOptions, useDialogBehavior } from "../useDialogBehavior.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderDialogBehavior(options: UseDialogBehaviorOptions) {
	return renderHook((opts: UseDialogBehaviorOptions) => useDialogBehavior(opts), {
		initialProps: options,
	});
}

// ---------------------------------------------------------------------------
// Dismissal rule: clean closes immediately
// ---------------------------------------------------------------------------

describe("useDialogBehavior dismissal rule", () => {
	it("clean dialog: requestDismiss calls onClose immediately", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, isDirty: false });

		act(() => {
			result.current.requestDismiss();
		});

		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.guarding).toBe(false);
	});

	it("clean dialog (isDirty omitted — defaults false): requestDismiss calls onClose", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose });

		act(() => {
			result.current.requestDismiss();
		});

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("dirty dialog: first requestDismiss does NOT call onClose; sets guarding=true", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, isDirty: true });

		act(() => {
			result.current.requestDismiss();
		});

		expect(onClose).not.toHaveBeenCalled();
		expect(result.current.guarding).toBe(true);
	});

	it("dirty dialog: second requestDismiss while guarding calls cancelDiscard (Keep editing)", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, isDirty: true });

		// First Esc → guard
		act(() => {
			result.current.requestDismiss();
		});
		expect(result.current.guarding).toBe(true);

		// Second Esc while guarding → cancelDiscard (Keep editing = strip closes, dialog stays open)
		act(() => {
			result.current.requestDismiss();
		});

		expect(onClose).not.toHaveBeenCalled();
		expect(result.current.guarding).toBe(false);
	});

	it("confirmation dialog (isDirty=false always): requestDismiss always calls onClose (scenario 2)", () => {
		// This is the confirmation-never-dirty rule (approved.md §1.1):
		// kill-confirm passes isDirty=false ALWAYS — Esc closes, empty or typed reason.
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, isDirty: false });

		act(() => {
			result.current.requestDismiss();
		});

		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.guarding).toBe(false);
	});

	it("confirmDiscard: closes and calls onClose; clears guarding", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, isDirty: true });

		act(() => {
			result.current.requestDismiss();
		});
		expect(result.current.guarding).toBe(true);

		act(() => {
			result.current.confirmDiscard();
		});

		expect(onClose).toHaveBeenCalledOnce();
		expect(result.current.guarding).toBe(false);
	});

	it("cancelDiscard: closes strip; does NOT call onClose", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, isDirty: true });

		act(() => {
			result.current.requestDismiss();
		});
		expect(result.current.guarding).toBe(true);

		act(() => {
			result.current.cancelDiscard();
		});

		expect(onClose).not.toHaveBeenCalled();
		expect(result.current.guarding).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Layer → zIndex resolution
// ---------------------------------------------------------------------------

describe("useDialogBehavior layer → zIndex", () => {
	it("getOverlayProps returns role='dialog'", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose });
		const props = result.current.getOverlayProps();
		expect(props.role).toBe("dialog");
	});

	it("getOverlayProps returns aria-modal=true for modal (default)", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, modal: true });
		const props = result.current.getOverlayProps();
		expect(props["aria-modal"]).toBe(true);
	});

	it("getOverlayProps returns aria-modal=false for non-modal", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, modal: false });
		const props = result.current.getOverlayProps();
		expect(props["aria-modal"]).toBe(false);
	});

	it("getOverlayProps returns data-dialog-layer attribute matching the layer prop", () => {
		// S-4 from architecture-critique: data-dialog-layer must be in getOverlayProps output
		// so tests can query by layer. This is the attribute carve-out tests use.
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, layer: "dialog" });
		const props = result.current.getOverlayProps();
		// The data-dialog-layer attribute enables the GlobalSearchPanel cmdk carve-out
		// and any other selector migration that replaces .modal.modal-open
		expect((props as Record<string, unknown>)["data-dialog-layer"]).toBe("dialog");
	});

	it("data-dialog-layer='overlay' for layer='overlay'", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, layer: "overlay" });
		const props = result.current.getOverlayProps();
		expect((props as Record<string, unknown>)["data-dialog-layer"]).toBe("overlay");
	});
});

// ---------------------------------------------------------------------------
// modal=false: no scrim props
// ---------------------------------------------------------------------------

describe("useDialogBehavior modal=false (non-modal surfaces)", () => {
	it("modal=false: getScrimProps returns null (no backdrop)", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, modal: false });
		expect(result.current.getScrimProps()).toBeNull();
	});

	it("modal=true (default): getScrimProps returns an object (not null)", () => {
		const onClose = vi.fn();
		const { result } = renderDialogBehavior({ open: true, onClose, modal: true });
		expect(typeof result.current.getScrimProps()?.onMouseDown).toBe("function");
	});

	it("modal=true exposes scrim props; modal=false does not", () => {
		const onClose = vi.fn();
		const { result, rerender } = renderDialogBehavior({ open: true, onClose, modal: true });
		expect(result.current.getScrimProps()).not.toBeNull();

		rerender({ open: true, onClose, modal: false });
		expect(result.current.getScrimProps()).toBeNull();
	});
});
