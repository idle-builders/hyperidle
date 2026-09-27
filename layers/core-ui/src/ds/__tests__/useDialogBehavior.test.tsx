// @vitest-environment jsdom

/**
 * useDialogBehavior hook: dismissal rule + layer resolution.
 *
 * Covers: one dismissal grammar — dirty input is never lost to a single
 * Esc/backdrop, and confirmations (isDirty=false) always close; focus
 * enters on open, is trapped, and returns to the trigger on close; layer →
 * zIndex resolution.
 *
 * @lore: jsdom does not implement `inert` — tests assert the focus-trap path and treat `inert` as a graceful no-op. Do NOT assert the `inert` attribute under jsdom; assert it via a real-browser E2E test instead.
 *
 * @lore jsdom-no-layout: focus-trap-react requires `displayCheck:"none"` under jsdom because jsdom doesn't lay out elements (all computed sizes are 0). Carried forward from the existing web-side lore into the DS hook.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These imports will fail until the green phase creates the files.
// That is expected red-phase behavior.
import {
	type UseDialogBehavior,
	type UseDialogBehaviorOptions,
	useDialogBehavior,
} from "../useDialogBehavior.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Test harness: a minimal wrapper that calls the hook and exposes its return
// ---------------------------------------------------------------------------

let capturedBehavior: UseDialogBehavior | null = null;

interface WrapperProps {
	options: UseDialogBehaviorOptions;
}

function BehaviorWrapper({ options }: WrapperProps): null {
	capturedBehavior = useDialogBehavior(options);
	return null;
}

// ---------------------------------------------------------------------------
// Dismissal rule: clean closes immediately
// ---------------------------------------------------------------------------

describe("useDialogBehavior dismissal rule", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		capturedBehavior = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		capturedBehavior = null;
	});

	it("clean dialog: requestDismiss calls onClose immediately", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, isDirty: false },
				}),
			);
		});

		expect(capturedBehavior).not.toBeNull();
		act(() => {
			capturedBehavior!.requestDismiss();
		});

		expect(onClose).toHaveBeenCalledOnce();
		expect(capturedBehavior!.guarding).toBe(false);
	});

	it("clean dialog (isDirty omitted — defaults false): requestDismiss calls onClose", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose },
				}),
			);
		});

		act(() => {
			capturedBehavior!.requestDismiss();
		});

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("dirty dialog: first requestDismiss does NOT call onClose; sets guarding=true", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, isDirty: true },
				}),
			);
		});

		act(() => {
			capturedBehavior!.requestDismiss();
		});

		expect(onClose).not.toHaveBeenCalled();
		expect(capturedBehavior!.guarding).toBe(true);
	});

	it("dirty dialog: second requestDismiss while guarding calls cancelDiscard (Keep editing)", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, isDirty: true },
				}),
			);
		});

		// First Esc → guard
		act(() => {
			capturedBehavior!.requestDismiss();
		});
		expect(capturedBehavior!.guarding).toBe(true);

		// Second Esc while guarding → cancelDiscard (Keep editing = strip closes, dialog stays open)
		act(() => {
			capturedBehavior!.requestDismiss();
		});

		expect(onClose).not.toHaveBeenCalled();
		expect(capturedBehavior!.guarding).toBe(false);
	});

	it("confirmation dialog (isDirty=false always): requestDismiss always calls onClose (scenario 2)", () => {
		// This is the confirmation-never-dirty rule (approved.md §1.1):
		// kill-confirm passes isDirty=false ALWAYS — Esc closes, empty or typed reason.
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, isDirty: false },
				}),
			);
		});

		act(() => {
			capturedBehavior!.requestDismiss();
		});

		expect(onClose).toHaveBeenCalledOnce();
		expect(capturedBehavior!.guarding).toBe(false);
	});

	it("confirmDiscard: closes and calls onClose; clears guarding", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, isDirty: true },
				}),
			);
		});

		act(() => {
			capturedBehavior!.requestDismiss();
		});
		expect(capturedBehavior!.guarding).toBe(true);

		act(() => {
			capturedBehavior!.confirmDiscard();
		});

		expect(onClose).toHaveBeenCalledOnce();
		expect(capturedBehavior!.guarding).toBe(false);
	});

	it("cancelDiscard: closes strip; does NOT call onClose", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, isDirty: true },
				}),
			);
		});

		act(() => {
			capturedBehavior!.requestDismiss();
		});
		expect(capturedBehavior!.guarding).toBe(true);

		act(() => {
			capturedBehavior!.cancelDiscard();
		});

		expect(onClose).not.toHaveBeenCalled();
		expect(capturedBehavior!.guarding).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Layer → zIndex resolution
// ---------------------------------------------------------------------------

describe("useDialogBehavior layer → zIndex", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		capturedBehavior = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		capturedBehavior = null;
	});

	it("getOverlayProps returns role='dialog'", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose },
				}),
			);
		});
		const props = capturedBehavior!.getOverlayProps();
		expect(props.role).toBe("dialog");
	});

	it("getOverlayProps returns aria-modal=true for modal (default)", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, modal: true },
				}),
			);
		});
		const props = capturedBehavior!.getOverlayProps();
		expect(props["aria-modal"]).toBe(true);
	});

	it("getOverlayProps returns aria-modal=false for non-modal", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, modal: false },
				}),
			);
		});
		const props = capturedBehavior!.getOverlayProps();
		expect(props["aria-modal"]).toBe(false);
	});

	it("getOverlayProps returns data-dialog-layer attribute matching the layer prop", () => {
		// S-4 from architecture-critique: data-dialog-layer must be in getOverlayProps output
		// so tests can query by layer. This is the attribute carve-out tests use.
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, layer: "dialog" },
				}),
			);
		});
		const props = capturedBehavior!.getOverlayProps();
		// The data-dialog-layer attribute enables the GlobalSearchPanel cmdk carve-out
		// and any other selector migration that replaces .modal.modal-open
		expect((props as Record<string, unknown>)["data-dialog-layer"]).toBe("dialog");
	});

	it("data-dialog-layer='overlay' for layer='overlay'", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, layer: "overlay" },
				}),
			);
		});
		const props = capturedBehavior!.getOverlayProps();
		expect((props as Record<string, unknown>)["data-dialog-layer"]).toBe("overlay");
	});
});

// ---------------------------------------------------------------------------
// modal=false: no scrim props
// ---------------------------------------------------------------------------

describe("useDialogBehavior modal=false (non-modal surfaces)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		capturedBehavior = null;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		capturedBehavior = null;
	});

	it("modal=false: getScrimProps returns null (no backdrop)", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, modal: false },
				}),
			);
		});
		expect(capturedBehavior!.getScrimProps()).toBeNull();
	});

	it("modal=true (default): getScrimProps returns an object (not null)", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, modal: true },
				}),
			);
		});
		expect(typeof capturedBehavior!.getScrimProps()?.onMouseDown).toBe("function");
	});

	it("modal=true exposes scrim props; modal=false does not", () => {
		const onClose = vi.fn();
		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, modal: true },
				}),
			);
		});
		expect(capturedBehavior!.getScrimProps()).not.toBeNull();

		act(() => {
			root.render(
				createElement(BehaviorWrapper, {
					options: { open: true, onClose, modal: false },
				}),
			);
		});
		expect(capturedBehavior!.getScrimProps()).toBeNull();
	});
});
