/**
 * AM3 design-phase fixtures + descriptor-driven control row.
 *
 * Shared by the three SessionDialIn placement variants (side / route / overlay).
 * NOT production wiring — these embody the design so the stories render in
 * isolation. The PRODUCTION rule the variants prove:
 *
 *  1. CONTROLS render DECLARATIVELY from a HarnessCapabilityDescriptor — the
 *     control kind comes from `HarnessModelOptionDescriptor.control`
 *     (select | boolean | number | text). An option the harness does not
 *     declare is ABSENT (no per-backend branching).
 *  2. ACTIVITY renders through AM1's `PartList` over a `Part[]` — the same
 *     source-agnostic renderer the conversation uses. The fixture below is the
 *     SHAPE `derivePartsFromSession()` will produce (architecture decides the
 *     adapter). Two backends producing the same action → the same Part shape.
 */

import { Fold, StatusChip } from "@hyperidle/design-system";
import type {
	HarnessCapabilityDescriptor,
	HarnessModelOptionDescriptor,
	Part,
} from "@hyperidle/shared";
import { type JSX, useState } from "react";

// ── Fixture: a capability descriptor (AM2 shape) ────────────────────
// Two models; the selected model declares effort (select) + a thinking toggle
// (boolean). MODE + PERMISSION are launch-scope selects. Note: NO "temperature"
// option is declared → it is ABSENT from the rendered controls. That absence is
// the descriptor-driven proof.
export const FIXTURE_DESCRIPTOR: HarnessCapabilityDescriptor = {
	type: "claude-code",
	name: "Claude Code",
	kind: "local",
	accessMode: "provider-subscription-cli",
	authAction: { kind: "native_cli_login", label: "Logged in" },
	discovery: { state: "ready", version: "1.4.2" },
	modelProviders: ["anthropic"],
	runtime: {
		preCompactionTrigger: true,
		subAgents: true,
		mcpSupport: true,
		modelProviders: ["anthropic"],
		fileEditing: true,
		toolUse: true,
	},
	models: [
		{
			id: "claude-opus-4-8",
			label: "Opus 4.8",
			provider: "anthropic",
			contextWindow: 1_000_000,
			selectable: true,
			inheritedFromGateway: false,
			options: [
				{
					key: "effort",
					label: "Reasoning effort",
					control: {
						kind: "select",
						choices: [
							{ value: "low", label: "Low" },
							{ value: "medium", label: "Medium" },
							{ value: "high", label: "High" },
						],
					},
					required: false,
					scope: "launch",
					defaultValue: "high",
				},
				{
					key: "mode",
					label: "Mode",
					control: {
						kind: "select",
						choices: [
							{ value: "default", label: "Default" },
							{ value: "plan", label: "Plan" },
							{ value: "accept-edits", label: "Accept edits" },
						],
					},
					required: false,
					scope: "launch",
					defaultValue: "default",
				},
				{
					key: "permission",
					label: "Permission",
					control: {
						kind: "select",
						choices: [
							{ value: "ask", label: "Ask each time" },
							{ value: "allow-edits", label: "Allow edits" },
							{ value: "full-auto", label: "Full auto" },
						],
					},
					required: false,
					scope: "launch",
					defaultValue: "ask",
				},
			],
		},
		{
			id: "claude-sonnet-4-6",
			label: "Sonnet 4.6",
			provider: "anthropic",
			contextWindow: 1_000_000,
			selectable: true,
			inheritedFromGateway: false,
			options: [],
		},
	],
};

// ── Fixture: session activity as Part[] (the derivePartsFromSession SHAPE) ──
// Tool calls + reasoning render as `prose` Parts (concept §Part: a session text
// event is a prose Part, decoupled from `plain`). A diff renders as a `diff`
// Embed → the same ReferenceChip the conversation uses. The agent is the author
// of every Part, so PartList's author grouping reads as one calm agent column.
const ATLAS = { id: "a-atlas", name: "Atlas", isAgent: true, isMe: false };

export const SESSION_PARTS: Part[] = [
	{
		id: "ev-1",
		kind: "prose",
		author: ATLAS,
		createdAt: "2026-06-17T10:01:02.000Z",
		embeds: [],
		text: "Read auth/passkey.ts and the WebAuthn registration helper to find the dual-auth seam.",
	},
	{
		id: "ev-2",
		kind: "prose",
		author: ATLAS,
		createdAt: "2026-06-17T10:01:09.000Z",
		embeds: [
			{
				kind: "diff",
				label: "auth/passkey.ts",
				meta: "+24 −3",
				target: { route: "artifact", artifactId: "art-1" },
			},
		],
		text: "Added the registration ceremony and a dual-auth fallback window.",
	},
	{
		id: "ev-3",
		kind: "prose",
		author: ATLAS,
		createdAt: "2026-06-17T10:01:21.000Z",
		embeds: [
			{
				kind: "diff",
				label: "auth/passkey.test.ts",
				meta: "+41 −0",
				target: { route: "artifact", artifactId: "art-2" },
			},
		],
		text: "Wrote coverage for the happy path and the timeout fallback.",
	},
	{
		id: "ev-4",
		kind: "prose",
		author: ATLAS,
		createdAt: "2026-06-17T10:01:33.000Z",
		embeds: [],
		text: "Ran the suite — 14 passed. The fallback window closes cleanly after 90s.",
	},
];

// ── Descriptor-driven control row (the AM2 → UI rule, embodied) ─────
// Renders ONE control per declared option, keyed by `control.kind`. A harness
// that declares no options for the selected model renders no option controls —
// the absence IS the proof. select → pill+menu affordance; boolean → toggle;
// number/text → input. (Design embodiment; real wiring is the builder's job.)

function SelectControl({
	option,
	value,
	onPick,
}: {
	option: Extract<HarnessModelOptionDescriptor, { control: { kind: "select" } }>;
	value: string;
	onPick: (v: string) => void;
}): JSX.Element {
	const choices = option.control.kind === "select" ? option.control.choices : [];
	return (
		<div className="flex flex-wrap items-center gap-[3px]" data-ds-control="select">
			{choices.map((c) => {
				const active = c.value === value;
				return (
					<button
						key={c.value}
						type="button"
						onClick={() => onPick(c.value)}
						className={
							active
								? "rounded-[var(--r-pill)] border border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] px-[9px] py-[3px] text-[12px] font-[600] text-[var(--accent-primary)]"
								: "rounded-[var(--r-pill)] border border-[var(--border-default)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
						}
					>
						{c.label}
					</button>
				);
			})}
		</div>
	);
}

/** A control's label — uppercase mono micro-label, mirrors KeyValue's label style. */
function ControlLabel({ children, fixed }: { children: string; fixed: boolean }): JSX.Element {
	return (
		<span
			className={`${fixed ? "w-[112px] shrink-0" : "shrink-0"} font-[family-name:var(--font-mono)] text-[11px] font-[500] uppercase tracking-[var(--tracking-caps)] text-[var(--text-tertiary)]`}
		>
			{children}
		</span>
	);
}

/** The declarative control surface: model row + one control per DECLARED option. */
export function DialInControls({ layout = "stack" }: { layout?: "stack" | "inline" }): JSX.Element {
	const descriptor = FIXTURE_DESCRIPTOR;
	const [modelId, setModelId] = useState(descriptor.models[0]?.id ?? "");
	const model = descriptor.models.find((m) => m.id === modelId) ?? descriptor.models[0];
	const [values, setValues] = useState<Record<string, string>>(() => {
		const v: Record<string, string> = {};
		for (const o of model?.options ?? []) {
			if (typeof o.defaultValue === "string") v[o.key] = o.defaultValue;
		}
		return v;
	});

	const rowClass =
		layout === "inline"
			? "flex flex-wrap items-center gap-x-[18px] gap-y-[9px]"
			: "flex flex-col gap-[12px]";

	return (
		<div data-ds-component="DialInControls" className={rowClass}>
			{/* Model — a select rendered from descriptor.models (selectable only). */}
			<div className="flex items-center gap-[9px]">
				<ControlLabel fixed={layout === "stack"}>Model</ControlLabel>
				<div className="flex flex-wrap items-center gap-[3px]">
					{descriptor.models
						.filter((m) => m.selectable)
						.map((m) => {
							const active = m.id === modelId;
							return (
								<button
									key={m.id}
									type="button"
									onClick={() => setModelId(m.id)}
									className={
										active
											? "rounded-[var(--r-pill)] border border-[var(--accent-primary)] bg-[var(--accent-primary-dim)] px-[9px] py-[3px] text-[12px] font-[600] text-[var(--accent-primary)]"
											: "rounded-[var(--r-pill)] border border-[var(--border-default)] px-[9px] py-[3px] text-[12px] font-[500] text-[var(--text-secondary)] transition-colors duration-[var(--motion-fast)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
									}
								>
									{m.label}
								</button>
							);
						})}
				</div>
			</div>

			{/* One control per DECLARED option of the selected model. Sonnet declares
			    none → these rows vanish entirely. That absence is the descriptor proof. */}
			{(model?.options ?? []).map((o) =>
				o.control.kind === "select" ? (
					<div key={o.key} className="flex items-center gap-[9px]">
						<ControlLabel fixed={layout === "stack"}>{o.label}</ControlLabel>
						<SelectControl
							option={o as Extract<HarnessModelOptionDescriptor, { control: { kind: "select" } }>}
							value={values[o.key] ?? ""}
							onPick={(v) => setValues((prev) => ({ ...prev, [o.key]: v }))}
						/>
					</div>
				) : null,
			)}
		</div>
	);
}

/** The dial-in header strip — agent · model · live/ended status. Mirrors ConversationHeader. */
export function DialInHeader({
	onClose,
	compact = false,
}: {
	onClose: () => void;
	compact?: boolean;
}): JSX.Element {
	return (
		<div
			className={`flex items-center gap-[9px] border-b border-[var(--border-subtle)] bg-[var(--surface-page)] px-[18px] ${
				compact ? "py-[9px]" : "py-[12px]"
			}`}
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-[6px]">
					<span className="inline-flex items-center rounded-[var(--r-pill)] bg-[var(--accent-primary-dim)] px-[9px] py-[1px] text-[11px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--accent-primary)]">
						Session
					</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<span className="truncate text-[13px] font-[600] text-[var(--text-primary)]">Atlas</span>
					<span className="text-[var(--text-tertiary)]">·</span>
					<span className="text-[12px] text-[var(--text-secondary)]">Wire passkey login</span>
				</div>
			</div>
			<StatusChip status="success" label="Ended · 1m 12s" />
			<button
				type="button"
				onClick={onClose}
				aria-label="Close session dial-in"
				className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[var(--r-subtle)] text-[var(--text-tertiary)] transition-colors duration-[var(--motion-fast)] hover:bg-[var(--surface-container)] hover:text-[var(--text-secondary)]"
			>
				<svg viewBox="0 0 16 16" fill="currentColor" className="h-[13px] w-[13px]" aria-hidden="true">
					<path d="M4.3 3.2L8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3l1.1-1.1z" />
				</svg>
			</button>
		</div>
	);
}

/** Collapsible config section header (used by variants that fold config away). */
export function ConfigFold({ open, onToggle }: { open: boolean; onToggle: () => void }): JSX.Element {
	return (
		<Fold label={open ? "Configuration" : "Configuration · hidden"} cta={open ? "Hide" : "Show"} onShow={onToggle} />
	);
}
