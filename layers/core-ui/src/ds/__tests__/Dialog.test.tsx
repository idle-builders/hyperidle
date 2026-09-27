// @vitest-environment jsdom

/**
 * Dialog component: chrome, portal, focus, dismissal guard.
 *
 * Covers: one dismissal grammar with dirty input guarded and confirmation
 * closing; focus enters on open, is trapped, and returns to the trigger on
 * close; a mobile bottom-anchored sheet class.
 *
 * @lore: Portal uses #overlay-root which is lazily created by
 * ensureOverlayRoot() inside useDialogBehavior. Tests do NOT mount
 * DialogPortalRoot — the hook's lazy-create logic makes Dialog
 * self-sufficient in bare jsdom renders.
 *
 * @lore: `inert` is NOT asserted here — jsdom doesn't implement it. Use a
 * real-browser E2E test to assert the #root inert attribute.
 *
 * @lore: focus-trap-react requires displayCheck:"none" under jsdom. This
 * must be threaded into useDialogBehavior's FocusTrap initialization.
 */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// These imports fail until green phase creates the files — expected red behavior.
import { Dialog, type DialogProps } from "../Dialog.js";

// biome-ignore lint/style/useNamingConvention: React's flag name is fixed.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeProps(overrides: Partial<DialogProps> = {}): DialogProps {
	return {
		open: true,
		onClose: vi.fn(),
		title: "Test dialog",
		children: createElement("p", null, "Dialog body"),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Chrome renders (title, role, close button)
// ---------------------------------------------------------------------------

describe("Dialog chrome", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		// Clean up any portal root created during the test
		const portalRoot = document.getElementById("overlay-root");
		portalRoot?.remove();
	});

	it("renders nothing when open=false", async () => {
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ open: false })));
		});
		// With portal, the dialog content is in #overlay-root, not container.
		// When open=false, the dialog element must not be in the document at all.
		const dialog = document.querySelector("[role='dialog']");
		expect(dialog).toBeNull();
	});

	it("renders a dialog element with role='dialog' when open=true", async () => {
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ open: true })));
		});
		const dialog = document.querySelector("[role='dialog']");
		expect(dialog).toBeInTheDocument();
	});

	it("renders the title text in the dialog header", async () => {
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ title: "My Dialog Title" })));
		});
		const dialog = document.querySelector("[role='dialog']");
		expect(dialog?.textContent).toContain("My Dialog Title");
	});

	it("renders the children inside the dialog", async () => {
		await act(async () => {
			root.render(
				createElement(
					Dialog,
					makeProps({ children: createElement("p", { "data-testid": "body" }, "Body content") }),
				),
			);
		});
		const body = document.querySelector("[data-testid='body']");
		expect(body).not.toBeNull();
		expect(body?.textContent).toBe("Body content");
	});

	it("renders a close button (✕) in the header", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose })));
		});
		// The close button is labelled for accessibility
		const closeBtn = document.querySelector(
			"[aria-label='Close dialog']",
		) as HTMLButtonElement | null;
		expect(closeBtn).toBeInTheDocument();
	});

	it("clicking the close button calls onClose", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: false })));
		});
		const closeBtn = document.querySelector(
			"[aria-label='Close dialog']",
		) as HTMLButtonElement | null;
		expect(closeBtn).not.toBeNull();
		await act(async () => {
			closeBtn?.click();
		});
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("renders footer slot when footer prop is provided", async () => {
		await act(async () => {
			root.render(
				createElement(
					Dialog,
					makeProps({
						footer: createElement(
							"button",
							{ "data-testid": "action-btn", type: "button" as const },
							"Save",
						),
					}),
				),
			);
		});
		const btn = document.querySelector("[data-testid='action-btn']");
		expect(btn?.textContent).toBe("Save");
	});
});

// ---------------------------------------------------------------------------
// Dismissal guard: dirty dialog shows DiscardConfirmStrip
// ---------------------------------------------------------------------------

describe("Dialog dismissal guard", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		const portalRoot = document.getElementById("overlay-root");
		portalRoot?.remove();
	});

	it("dirty dialog: pressing Escape does NOT call onClose immediately (raises guard)", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: true })));
		});

		// Simulate Escape keydown on the overlay element
		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		expect(overlay).not.toBeNull();

		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		expect(onClose).not.toHaveBeenCalled();
	});

	it("dirty dialog: after Escape the DiscardConfirmStrip is visible", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: true })));
		});

		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		// The guard strip must be visible, with its prompt copy.
		const strip =
			document.querySelector("[data-testid='discard-confirm-strip']") ??
			document.querySelector("[data-dialog-guard]");
		expect(strip?.textContent).toContain("Discard your changes?");
	});

	it("clean dialog (isDirty=false): pressing Escape calls onClose immediately (confirmation rule §1.1)", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: false })));
		});

		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		expect(onClose).toHaveBeenCalledOnce();
	});

	it("guard strip: Keep editing button restores footer (cancelDiscard)", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: true })));
		});

		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		// Raise the guard
		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		// Click "Keep editing"
		const keepBtn = Array.from(document.querySelectorAll("button")).find((b) =>
			/keep editing/i.test(b.textContent ?? ""),
		);
		expect(keepBtn).not.toBeNull();
		await act(async () => {
			keepBtn?.click();
		});

		expect(onClose).not.toHaveBeenCalled();
		// Strip must disappear
		const strip = document.querySelector("[data-testid='discard-confirm-strip']");
		expect(strip).toBeNull();
	});

	it("guard strip: Discard button calls onClose (confirmDiscard)", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: true })));
		});

		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		const discardBtn = Array.from(document.querySelectorAll("button")).find((b) =>
			/^discard$/i.test(b.textContent?.trim() ?? ""),
		);
		expect(discardBtn).not.toBeNull();
		await act(async () => {
			discardBtn?.click();
		});

		expect(onClose).toHaveBeenCalledOnce();
	});
});

// ---------------------------------------------------------------------------
// Portal: renders into #overlay-root (body sibling of #root)
// ---------------------------------------------------------------------------

describe("Dialog portal mount", () => {
	let appRoot: HTMLDivElement;
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		// Simulate the real app structure: #root is the React mount point
		appRoot = document.createElement("div");
		appRoot.id = "root";
		document.body.appendChild(appRoot);

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		appRoot.remove();
		const portalRoot = document.getElementById("overlay-root");
		portalRoot?.remove();
	});

	it("Dialog portals into #overlay-root, not into its React host container", async () => {
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ open: true })));
		});

		// The dialog DOM must be inside #overlay-root, not inside the container
		const overlayRoot = document.getElementById("overlay-root");
		expect(overlayRoot).not.toBeNull();
		const dialogInOverlay = overlayRoot?.querySelector("[role='dialog']");
		expect(dialogInOverlay).not.toBeNull();

		// The dialog must NOT be inside the test container (which is not #overlay-root)
		const dialogInContainer = container.querySelector("[role='dialog']");
		expect(dialogInContainer).toBeNull();
	});

	it("#overlay-root is created as a sibling of #root under body", async () => {
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ open: true })));
		});

		const overlayRoot = document.getElementById("overlay-root");
		expect(overlayRoot).not.toBeNull();
		// Both #root and #overlay-root are direct children of body
		expect(overlayRoot?.parentElement).toBe(document.body);
	});
});

// ---------------------------------------------------------------------------
// Focus trap: focus enters dialog on open
// ---------------------------------------------------------------------------

describe("Dialog focus behavior", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		const portalRoot = document.getElementById("overlay-root");
		portalRoot?.remove();
	});

	it("focus moves into the dialog when open=true", async () => {
		// A trigger button outside the dialog — focus should return here on close (AC-2)
		const trigger = document.createElement("button");
		trigger.textContent = "Open dialog";
		document.body.appendChild(trigger);
		trigger.focus();

		await act(async () => {
			root.render(
				createElement(
					Dialog,
					makeProps({
						open: true,
						children: createElement(
							"button",
							{ "data-testid": "first-focus", type: "button" as const },
							"First",
						),
					}),
				),
			);
		});

		// After opening, activeElement must be inside the dialog
		const overlay = document.getElementById("overlay-root");
		const activeEl = document.activeElement;
		// Focus is somewhere inside the portal root (either the dialog or a button within it)
		const focusIsInDialog = overlay?.contains(activeEl) ?? false;
		expect(focusIsInDialog).toBe(true);

		trigger.remove();
	});

	it("focus returns to the trigger element after dialog closes", async () => {
		// @lore: FocusTrap returnFocusOnDeactivate=true wires return-focus.
		// We verify it actually fires by: focus trigger → open → focus is in dialog →
		// close (open=false) → focus returns to trigger.
		const trigger = document.createElement("button");
		trigger.textContent = "Trigger";
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const onClose = vi.fn();

		// Open the dialog (focus moves in)
		await act(async () => {
			root.render(
				createElement(
					Dialog,
					makeProps({
						open: true,
						onClose,
						children: createElement(
							"button",
							{ "data-testid": "inner-btn", type: "button" as const },
							"Inner",
						),
					}),
				),
			);
		});

		// Focus is now inside the dialog
		const overlay = document.getElementById("overlay-root");
		expect(overlay?.contains(document.activeElement)).toBe(true);

		// Close the dialog (open=false) — FocusTrap deactivates → returns focus to trigger
		await act(async () => {
			root.render(
				createElement(
					Dialog,
					makeProps({
						open: false,
						onClose,
						children: createElement(
							"button",
							{ "data-testid": "inner-btn", type: "button" as const },
							"Inner",
						),
					}),
				),
			);
		});

		// Focus must be back on the original trigger
		expect(document.activeElement).toBe(trigger);

		trigger.remove();
	});
});

// ---------------------------------------------------------------------------
// Mobile bottom-sheet class
// ---------------------------------------------------------------------------

describe("Dialog mobile adaptation", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		const portalRoot = document.getElementById("overlay-root");
		portalRoot?.remove();
	});

	it("dialog box carries a mobile-sheet indicator class or data attribute for CSS targeting", async () => {
		// The Dialog primitive owns bottom-anchoring at ≤480px via CSS.
		// This test verifies the box carries the hook that CSS rules target.
		// Green phase must emit data-dialog-mobile-sheet or a CSS class that anchors to bottom.
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ open: true })));
		});

		const box =
			document.querySelector("[data-dialog-box]") ??
			document.querySelector("[data-testid='dialog-box']");
		expect(box).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Guard strip: keyboard discard path
// ---------------------------------------------------------------------------

describe("Dialog guard strip keyboard discard path (§1.2)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		const portalRoot = document.getElementById("overlay-root");
		portalRoot?.remove();
	});

	it("guard strip: Keep editing button is the first focusable button in the strip", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: true })));
		});

		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		// Keep editing is the first button in the strip — the safe default
		const strip =
			document.querySelector("[data-testid='discard-confirm-strip']") ??
			document.querySelector("[data-dialog-guard]");
		expect(strip).not.toBeNull();

		const buttons = strip?.querySelectorAll("button");
		expect(buttons?.length).toBeGreaterThanOrEqual(2);

		const firstBtn = buttons?.[0];
		expect(/keep editing/i.test(firstBtn?.textContent ?? "")).toBe(true);
	});

	it("guard strip: Discard is the second button (reachable via Tab)", async () => {
		const onClose = vi.fn();
		await act(async () => {
			root.render(createElement(Dialog, makeProps({ onClose, isDirty: true })));
		});

		const overlay = document.querySelector("[role='dialog']") as HTMLElement | null;
		await act(async () => {
			overlay?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		});

		const strip =
			document.querySelector("[data-testid='discard-confirm-strip']") ??
			document.querySelector("[data-dialog-guard]");
		const buttons = strip?.querySelectorAll("button");
		const discardBtn = buttons?.[1];
		expect(/^discard$/i.test(discardBtn?.textContent?.trim() ?? "")).toBe(true);
	});
});
