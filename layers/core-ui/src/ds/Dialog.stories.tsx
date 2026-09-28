/**
 * AI2 — Dialog stories: covers all AC-relevant states.
 *
 * States: clean, dirty/guarding, confirmation (isDirty=false always),
 * non-modal, sm/md/lg sizes, MobileSheet (375px, bottom-anchored).
 *
 * The MobileSheet story is the AC-4 proof that bottom-anchoring is implemented
 * as a primitive behavior. See architecture §7 and approved.md §7.
 */

import { useState } from "react";
import { Button } from "./Button.js";
import { Dialog } from "./Dialog.js";

export default { title: "AI2/Dialog" };

function CleanDialogDemo(): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Open dialog
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Clean dialog"
				footer={
					<>
						<Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button variant="primary" size="sm" type="button" onClick={() => setOpen(false)}>
							Save
						</Button>
					</>
				}
			>
				<p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
					This dialog has no dirty state. Pressing Escape, clicking the backdrop, or clicking ✕
					closes immediately.
				</p>
			</Dialog>
		</>
	);
}
export const Clean = CleanDialogDemo;

function DirtyGuardingDemo(): JSX.Element {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	return (
		<>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Open authoring dialog
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Authoring form (guards when dirty)"
				isDirty={value.length > 0}
				footer={
					<>
						<Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button variant="primary" size="sm" type="button" onClick={() => setOpen(false)}>
							Save
						</Button>
					</>
				}
			>
				<label style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
					<span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
						Type something to make it dirty, then press Escape
					</span>
					<input
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						style={{
							fontSize: "var(--text-base)",
							border: "1px solid var(--border-default)",
							borderRadius: "var(--r-subtle)",
							padding: "var(--space-2) var(--space-4)",
						}}
					/>
				</label>
			</Dialog>
		</>
	);
}
export const DirtyGuarding = DirtyGuardingDemo;

function ConfirmationDemo(): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Open confirmation
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Kill this bet?"
				isDirty={false}
				footer={
					<>
						<Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							type="button"
							onClick={() => setOpen(false)}
							className="text-error"
						>
							Kill bet
						</Button>
					</>
				}
			>
				<p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
					Confirmation dialogs always pass isDirty=false. Pressing Escape closes immediately —
					whether or not the reason field has text (§1.1 confirmation-never-dirty rule).
				</p>
			</Dialog>
		</>
	);
}
export const Confirmation = ConfirmationDemo;

function NonModalDemo(): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Open non-modal overlay
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Non-modal overlay"
				modal={false}
				layer="overlay"
			>
				<p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
					Non-modal: no scrim, no backdrop-dismiss. Page stays interactive. Escape still closes
					(guarded if dirty).
				</p>
			</Dialog>
		</>
	);
}
export const NonModal = NonModalDemo;

function SmallDemo(): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Small (400px)
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Small dialog"
				size="sm"
				footer={
					<Button variant="primary" size="sm" type="button" onClick={() => setOpen(false)}>
						OK
					</Button>
				}
			>
				<p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
					Small size — 400px max-width.
				</p>
			</Dialog>
		</>
	);
}
export const SizeSm = SmallDemo;

function LargeDemo(): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Large (720px)
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Large dialog"
				size="lg"
				footer={
					<Button variant="primary" size="sm" type="button" onClick={() => setOpen(false)}>
						OK
					</Button>
				}
			>
				<p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
					Large size — 720px max-width.
				</p>
			</Dialog>
		</>
	);
}
export const SizeLg = LargeDemo;

/**
 * MobileSheet — AC-4 proof: at ≤480px every dialog becomes a bottom-anchored
 * full-width-minus-gutter bottom-sheet.
 *
 * @lore bottom-sheet: CSS @media (max-width:480px) on [data-dialog-box]; this story simulates 375px viewport; AC-4 asserts bounding box bottom ≈ viewport height
 */
function MobileSheetDemo(): JSX.Element {
	const [open, setOpen] = useState(true);
	return (
		<div
			style={{
				width: "375px",
				height: "667px",
				position: "relative",
				overflow: "hidden",
				border: "1px solid var(--border-default)",
				background: "var(--surface-page)",
			}}
		>
			<Button variant="primary" size="sm" type="button" onClick={() => setOpen(true)}>
				Open mobile sheet
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Mobile bottom-sheet"
				footer={
					<>
						<Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button variant="primary" size="sm" type="button" onClick={() => setOpen(false)}>
							Save
						</Button>
					</>
				}
			>
				<p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
					At ≤480px, Dialog renders as a bottom-anchored sheet with full width minus 12px gutter
					(6px each side), sliding up from below. Actions are at the bottom.
				</p>
			</Dialog>
		</div>
	);
}
export const MobileSheet = MobileSheetDemo;

// Ensure JSX import is present
import type { JSX } from "react";
