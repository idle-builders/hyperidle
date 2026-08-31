/**
 * SettingsActionRules — add, view and remove action rules.
 *
 * An action rule marks an agent action as requiring human approval.
 * Scope is global, team, or agent. The list starts empty on a fresh
 * install and never ships pre-populated — rules accumulate from what
 * teams choose to gate.
 *
 * @lore BA2 (ruling 1): no rule is ever pre-loaded. An empty list is
 * the designed state; the surface renders it honestly with no fabricated
 * placeholder content.
 *
 * @lore BA2 (ruling 20): scope is global | team | agent. The settings
 * surface shows each rule's scope so a human can see at a glance which
 * scope is in force without having to guess from context.
 */

// hearth-internal-padding

import { type JSX, useCallback, useEffect, useState } from "react";
import { Button, ErrorState, Input, Select, Tag } from "../ds";
import { apiFetch } from "../services/api-fetch.js";
import { useToast } from "../shell/ToastRegion.js";

// ---------------------------------------------------------------------------
// Types (mirrors /api/settings/action-rules response shape)
// ---------------------------------------------------------------------------

type ActionRuleScope = "global" | "team" | "agent";

interface ActionRule {
	id: string;
	pattern: string;
	description: string;
	scope: ActionRuleScope;
	scopeId: string | null;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopeLabel(scope: ActionRuleScope, scopeId: string | null): string {
	if (scope === "global") return "Global";
	if (scope === "team") return `Team: ${scopeId ?? "—"}`;
	return `Agent: ${scopeId ?? "—"}`;
}

// ---------------------------------------------------------------------------
// Add-rule form state
// ---------------------------------------------------------------------------

interface FormState {
	pattern: string;
	description: string;
	scope: ActionRuleScope;
	scopeId: string;
}

const DEFAULT_FORM: FormState = {
	pattern: "",
	description: "",
	scope: "global",
	scopeId: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsActionRules(): JSX.Element {
	const { showToast } = useToast();
	const [rules, setRules] = useState<ActionRule[]>([]);
	const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
	const [form, setForm] = useState<FormState>(DEFAULT_FORM);
	const [adding, setAdding] = useState(false);
	const [removing, setRemoving] = useState<Set<string>>(new Set());

	const load = useCallback(async (): Promise<void> => {
		setStatus("loading");
		try {
			const res = await apiFetch("/api/settings/action-rules");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { rules: ActionRule[] };
			setRules(Array.isArray(body.rules) ? body.rules : []);
			setStatus("ready");
		} catch {
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleAdd(): Promise<void> {
		if (!(form.pattern.trim() && form.description.trim())) return;
		if (form.scope !== "global" && !form.scopeId.trim()) {
			showToast("A team or agent ID is required for that scope.");
			return;
		}
		setAdding(true);
		try {
			const body: Record<string, string> = {
				pattern: form.pattern.trim(),
				description: form.description.trim(),
				scope: form.scope,
			};
			if (form.scope !== "global") {
				body.scopeId = form.scopeId.trim();
			}
			const res = await apiFetch("/api/settings/action-rules", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => ({}))) as { error?: string };
				showToast(err.error ?? "Failed to add rule.");
				return;
			}
			showToast("Rule added.");
			setForm(DEFAULT_FORM);
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setAdding(false);
		}
	}

	async function handleRemove(rule: ActionRule): Promise<void> {
		setRemoving((prev) => new Set([...prev, rule.id]));
		try {
			const res = await apiFetch(`/api/settings/action-rules/${rule.id}`, { method: "DELETE" });
			if (!res.ok && res.status !== 204) {
				showToast("Failed to remove rule.");
				return;
			}
			showToast("Rule removed.");
			await load();
		} catch {
			showToast("Network error.");
		} finally {
			setRemoving((prev) => {
				const next = new Set(prev);
				next.delete(rule.id);
				return next;
			});
		}
	}

	if (status === "error") {
		return (
			<ErrorState
				compact
				title="Couldn't load action rules"
				description="Failed to load action rules. Please try again."
			/>
		);
	}

	return (
		<div className="flex flex-col gap-[24px]">
			<p className="type-metadata max-w-[560px] text-[var(--text-tertiary)]">
				Rules mark specific agent actions as requiring a human's approval before the agent may take
				them. The list is empty by default — nothing interrupts an agent until you add a rule.
			</p>

			{/* ── Rule list ─────────────────────────────────────────────────── */}
			<div className="flex flex-col gap-[12px]">
				<span className="type-label uppercase text-[var(--text-tertiary)]">
					{status === "loading" ? "Loading rules…" : "Active rules"}
				</span>

				{status === "ready" && rules.length === 0 ? (
					<p className="type-metadata text-[var(--text-tertiary)]" data-testid="action-rules-empty">
						No rules defined. Add one below to start gating agent actions.
					</p>
				) : null}

				{status === "ready" && rules.length > 0 ? (
					<div
						className="border-width-thin overflow-hidden rounded-[var(--r-default)] border-[var(--border-subtle)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)]"
						data-testid="action-rules-list"
					>
						{rules.map((rule, index) => (
							<div key={rule.id}>
								{index > 0 ? <div className="h-px bg-[var(--border-subtle)]" /> : null}
								<div className="flex items-center gap-[12px] px-[12px] py-[12px]">
									<div className="flex min-w-0 flex-1 flex-col gap-[3px]">
										<div className="flex items-center gap-[9px]">
											<span
												className="type-data truncate text-[var(--text-primary)]"
												data-testid="rule-pattern"
											>
												{rule.pattern}
											</span>
											<Tag
												label={scopeLabel(rule.scope, rule.scopeId)}
												data-testid="rule-scope-tag"
											/>
										</div>
										<span className="type-metadata text-[var(--text-secondary)]">
											{rule.description}
										</span>
									</div>
									<div className="shrink-0">
										<Button
											variant="ghost"
											size="sm"
											aria-label={`Remove rule: ${rule.pattern}`}
											disabled={removing.has(rule.id)}
											onClick={() => void handleRemove(rule)}
										>
											Remove
										</Button>
									</div>
								</div>
							</div>
						))}
					</div>
				) : null}
			</div>

			{/* ── Add rule form ──────────────────────────────────────────────── */}
			<div className="flex flex-col gap-[12px]">
				<span className="type-label uppercase text-[var(--text-tertiary)]">Add a rule</span>
				<div className="flex flex-col gap-[9px]">
					<div className="flex gap-[9px]">
						<div className="flex-1">
							<Input
								label="Pattern"
								value={form.pattern}
								onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
								placeholder="e.g. git push, rm -rf, deploy"
								aria-label="Action pattern"
								data-testid="rule-input-pattern"
							/>
						</div>
						<div className="w-[140px] shrink-0">
							<Select
								label="Scope"
								value={form.scope}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										scope: e.target.value as ActionRuleScope,
										scopeId: "",
									}))
								}
								options={[
									{ value: "global", label: "Global" },
									{ value: "team", label: "Team" },
									{ value: "agent", label: "Agent" },
								]}
								aria-label="Rule scope"
								data-testid="rule-select-scope"
							/>
						</div>
					</div>
					<Input
						label="Description"
						value={form.description}
						onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
						placeholder="Human-readable label for this rule"
						aria-label="Rule description"
						data-testid="rule-input-description"
					/>
					{form.scope !== "global" ? (
						<Input
							label={form.scope === "team" ? "Team ID" : "Agent ID"}
							value={form.scopeId}
							onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
							placeholder={form.scope === "team" ? "Team ID" : "Agent user ID"}
							aria-label={form.scope === "team" ? "Team ID" : "Agent ID"}
							data-testid="rule-input-scope-id"
						/>
					) : null}
					<div className="flex justify-end">
						<Button
							variant="primary"
							size="sm"
							disabled={adding || !form.pattern.trim() || !form.description.trim()}
							onClick={() => void handleAdd()}
							data-testid="rule-add-button"
						>
							{adding ? "Adding…" : "Add rule"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
