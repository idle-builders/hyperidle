/**
 * L10 — First-Run Flow page.
 *
 * Step machine: bootstrap → api-key → north-star → team-scaffold → done.
 * Server is the source of truth (`GET /api/first-run/status`); the page
 * derives its starting step from the status flags so a refresh mid-flow
 * picks up where the user left off.
 *
 * @lore L10: this is a page-level composition, not a Tier 3 custom component.
 * It assembles DaisyUI primitives + the design-system Button/StatusChip.
 *
 * @lore L10: the flow lives at `/first-run` as a sibling of `<AppShell />`
 * so the populated UI is unreachable until `complete=true`. The redirect
 * gate sits in `App.tsx`.
 *
 * @lore L10: the API-key step blocks until a real provider ping returns
 * 200. We do not store the typed key in component state beyond the form
 * input — the moment the request resolves we call the server which
 * persists it; the input is then cleared.
 */
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type FirstRunStatus, useFirstRun } from "../hooks/useFirstRun";

type StepId = "factory" | "api-key" | "north-star" | "team" | "done";

const STEP_ORDER: readonly StepId[] = ["factory", "api-key", "north-star", "team", "done"];

const STEP_LABELS: Record<StepId, string> = {
	factory: "Create factory",
	"api-key": "Connect provider",
	"north-star": "North Star",
	team: "First team",
	done: "All set",
};

function deriveStep(status: FirstRunStatus | null): StepId {
	if (!status) return "factory";
	if (!status.factoryReady) return "factory";
	if (!status.apiKeyReady) return "api-key";
	if (!status.northStarReady) return "north-star";
	if (!status.teamScaffoldHandled) return "team";
	return "done";
}

interface SectionProps {
	step: StepId;
	current: StepId;
	children: React.ReactNode;
}

function StepSection({ step, current, children }: SectionProps): JSX.Element | null {
	if (step !== current) return null;
	return (
		<section data-testid={`first-run-step-${step}`} className="flex flex-col gap-3">
			{children}
		</section>
	);
}

export function FirstRunFlow(): JSX.Element {
	const { status, loading, error, refresh } = useFirstRun();
	const navigate = useNavigate();
	const current = useMemo(() => deriveStep(status), [status]);

	useEffect(() => {
		if (status?.complete) {
			navigate("/conversations/review", { replace: true });
		}
	}, [status, navigate]);

	if (loading) {
		return (
			<div className="p-6" data-testid="first-run-loading">
				Loading…
			</div>
		);
	}
	if (error) {
		return (
			<div className="p-6 text-error" data-testid="first-run-error">
				Failed to load first-run status: {error.message}
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-[var(--surface-0)] flex flex-col" data-testid="first-run-flow">
			<header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-1)]">
				<h1 className="text-base font-heading font-semibold uppercase tracking-wider">
					Create your factory
				</h1>
				<StepIndicator current={current} />
			</header>
			<main className="flex-1 px-6 py-6 max-w-xl">
				<StepSection step="factory" current={current}>
					<FactoryStep onDone={refresh} />
				</StepSection>
				<StepSection step="api-key" current={current}>
					<ApiKeyStep onDone={refresh} apiKeyLast4={status?.apiKeyLast4 ?? null} />
				</StepSection>
				<StepSection step="north-star" current={current}>
					<NorthStarStep onDone={refresh} />
				</StepSection>
				<StepSection step="team" current={current}>
					<TeamScaffoldStep onDone={refresh} />
				</StepSection>
				<StepSection step="done" current={current}>
					<DoneStep onComplete={refresh} />
				</StepSection>
			</main>
		</div>
	);
}

function StepIndicator({ current }: { current: StepId }): JSX.Element {
	const idx = STEP_ORDER.indexOf(current);
	return (
		<ol className="flex gap-2" aria-label="First-run progress" data-testid="first-run-progress">
			{STEP_ORDER.map((s, i) => {
				const state = i < idx ? "done" : i === idx ? "active" : "pending";
				return (
					<li
						key={s}
						data-state={state}
						className="text-xs uppercase tracking-wider px-2 py-1 border border-[var(--border-1)]"
					>
						{STEP_LABELS[s]}
					</li>
				);
			})}
		</ol>
	);
}

interface StepProps {
	onDone: () => Promise<void>;
}

function FactoryStep({ onDone }: StepProps): JSX.Element {
	const [name, setName] = useState("");
	const [role, setRole] = useState<"CEO" | "CPO">("CEO");
	const [dataDir, setDataDir] = useState("~/.hyperidle");
	const [submitting, setSubmitting] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const nameInputRef = useRef<HTMLInputElement>(null);

	// @lore L10 spec: "the factory-name field is focused on first render"
	// — useEffect-based focus instead of autoFocus to satisfy a11y/no-autoFocus.
	useEffect(() => {
		nameInputRef.current?.focus();
	}, []);

	const submit = useCallback(
		async (e: React.FormEvent): Promise<void> => {
			e.preventDefault();
			if (!name.trim()) {
				setErr("Factory name is required");
				return;
			}
			setSubmitting(true);
			setErr(null);
			try {
				const res = await fetch("/api/first-run/factory", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: name.trim(), role, dataDir: dataDir.trim() }),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(body.error ?? `HTTP ${res.status}`);
				}
				await onDone();
			} catch (caught) {
				setErr(caught instanceof Error ? caught.message : String(caught));
			} finally {
				setSubmitting(false);
			}
		},
		[name, role, dataDir, onDone],
	);

	return (
		<form onSubmit={submit} className="flex flex-col gap-3" aria-label="Factory bootstrap">
			<label className="flex flex-col gap-1">
				<span className="text-xs uppercase tracking-wider">Factory name</span>
				<input
					ref={nameInputRef}
					type="text"
					className="input input-bordered input-sm"
					value={name}
					onChange={(e) => setName(e.target.value)}
					data-testid="first-run-factory-name"
				/>
			</label>
			<fieldset className="flex flex-col gap-1">
				<legend className="text-xs uppercase tracking-wider">Your role</legend>
				<div className="flex gap-2">
					{(["CEO", "CPO"] as const).map((r) => (
						<label key={r} className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="role"
								className="radio radio-sm"
								value={r}
								checked={role === r}
								onChange={() => setRole(r)}
								data-testid={`first-run-role-${r}`}
							/>
							<span>{r}</span>
						</label>
					))}
				</div>
			</fieldset>
			<label className="flex flex-col gap-1">
				<span className="text-xs uppercase tracking-wider">Data directory</span>
				<input
					type="text"
					className="input input-bordered input-sm"
					value={dataDir}
					onChange={(e) => setDataDir(e.target.value)}
					data-testid="first-run-data-dir"
				/>
			</label>
			{err && (
				<div role="alert" className="text-error text-sm" data-testid="first-run-factory-error">
					{err}
				</div>
			)}
			<div>
				<button
					type="submit"
					className="btn btn-sm btn-primary"
					disabled={submitting}
					data-testid="first-run-factory-submit"
				>
					{submitting ? "Creating…" : "Create factory"}
				</button>
			</div>
		</form>
	);
}

function ApiKeyStep({
	onDone,
	apiKeyLast4,
}: StepProps & { apiKeyLast4: string | null }): JSX.Element {
	const [key, setKey] = useState("");
	const [testing, setTesting] = useState(false);
	const [result, setResult] = useState<
		{ ok: true; last4: string } | { ok: false; message: string; status: number } | null
	>(apiKeyLast4 ? { ok: true, last4: apiKeyLast4 } : null);

	const testKey = useCallback(async (): Promise<void> => {
		setTesting(true);
		setResult(null);
		try {
			const res = await fetch("/api/first-run/api-key", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ key }),
			});
			const body = (await res.json()) as
				| { ok: true; status: number; last4: string }
				| { ok: false; status: number; message: string };
			if (body.ok) {
				setResult({ ok: true, last4: body.last4 });
				setKey("");
				await onDone();
			} else {
				setResult({ ok: false, message: body.message, status: body.status });
			}
		} catch (err) {
			setResult({
				ok: false,
				message: err instanceof Error ? err.message : String(err),
				status: 0,
			});
		} finally {
			setTesting(false);
		}
	}, [key, onDone]);

	const masked = result?.ok ? `sk-ant-•••••${result.last4}` : null;

	return (
		<fieldset className="flex flex-col gap-3" aria-label="API key">
			<p className="text-sm text-[var(--text-mid)]">
				HyperIdle uses Anthropic Claude. Paste an API key — we'll do a 1-token ping to validate.
			</p>
			<label className="flex flex-col gap-1">
				<span className="text-xs uppercase tracking-wider">Anthropic API key</span>
				<input
					type="password"
					className="input input-bordered input-sm font-mono"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					placeholder="sk-ant-…"
					autoComplete="off"
					data-testid="first-run-api-key-input"
				/>
			</label>
			{masked && (
				<div className="text-xs text-[var(--text-mid)]" data-testid="first-run-api-key-masked">
					Stored: {masked}
				</div>
			)}
			{result && !result.ok && (
				<div role="alert" className="text-error text-sm" data-testid="first-run-api-key-error">
					Test failed ({result.status}): {result.message}
				</div>
			)}
			{result?.ok && (
				<div className="text-success text-sm" data-testid="first-run-api-key-success">
					Key validated.
				</div>
			)}
			<div>
				<button
					type="button"
					onClick={testKey}
					className="btn btn-sm btn-primary"
					disabled={testing || key.length === 0}
					data-testid="first-run-api-key-test"
				>
					{testing ? "Testing…" : "Test key"}
				</button>
			</div>
		</fieldset>
	);
}

function NorthStarStep({ onDone }: StepProps): JSX.Element {
	const [principles, setPrinciples] = useState("");
	const [focus, setFocus] = useState("");
	const [portfolio, setPortfolio] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const trySubmit = useCallback(
		async (values: { principles: string; focus: string; portfolio: string }): Promise<void> => {
			setSubmitting(true);
			setErr(null);
			try {
				const res = await fetch("/api/first-run/north-star", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(values),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(body.error ?? `HTTP ${res.status}`);
				}
				await onDone();
			} catch (caught) {
				setErr(caught instanceof Error ? caught.message : String(caught));
			} finally {
				setSubmitting(false);
			}
		},
		[onDone],
	);

	const onSubmit = useCallback(
		(e: React.FormEvent): void => {
			e.preventDefault();
			void trySubmit({
				principles: principles.trim() || "I'll do this later.",
				focus: focus.trim() || "I'll do this later.",
				portfolio: portfolio.trim() || "I'll do this later.",
			});
		},
		[principles, focus, portfolio, trySubmit],
	);

	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label="North Star">
			<p className="text-sm text-[var(--text-mid)]">
				Three docs anchor the factory's intent. You can leave any of them with "I'll do this later"
				— the Coach will follow up.
			</p>
			{(
				[
					{
						label: "Principles",
						value: principles,
						set: setPrinciples,
						testid: "first-run-principles",
					},
					{ label: "Focus", value: focus, set: setFocus, testid: "first-run-focus" },
					{
						label: "Portfolio",
						value: portfolio,
						set: setPortfolio,
						testid: "first-run-portfolio",
					},
				] as const
			).map((field) => (
				<label key={field.label} className="flex flex-col gap-1">
					<span className="text-xs uppercase tracking-wider">{field.label}</span>
					<textarea
						className="textarea textarea-bordered min-h-[6rem]"
						value={field.value}
						onChange={(e) => field.set(e.target.value)}
						placeholder="I'll do this later"
						data-testid={field.testid}
					/>
				</label>
			))}
			{err && (
				<div role="alert" className="text-error text-sm" data-testid="first-run-north-star-error">
					{err}
				</div>
			)}
			<div>
				<button
					type="submit"
					className="btn btn-sm btn-primary"
					disabled={submitting}
					data-testid="first-run-north-star-submit"
				>
					{submitting ? "Saving…" : "Save & continue"}
				</button>
			</div>
		</form>
	);
}

function TeamScaffoldStep({ onDone }: StepProps): JSX.Element {
	const [productName, setProductName] = useState("");
	const [brief, setBrief] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const submit = useCallback(
		async (skipped: boolean): Promise<void> => {
			setSubmitting(true);
			setErr(null);
			try {
				const body = skipped
					? { skipped: true }
					: { skipped: false, productName: productName.trim(), brief: brief.trim() };
				const res = await fetch("/api/first-run/team-scaffold", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				});
				if (!res.ok) {
					const data = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(data.error ?? `HTTP ${res.status}`);
				}
				await onDone();
			} catch (caught) {
				setErr(caught instanceof Error ? caught.message : String(caught));
			} finally {
				setSubmitting(false);
			}
		},
		[productName, brief, onDone],
	);

	return (
		<fieldset className="flex flex-col gap-3" aria-label="First team scaffold">
			<p className="text-sm text-[var(--text-mid)]">
				Optionally seed your first product + team. You can skip — agents and bets can be created
				later from the Work surface.
			</p>
			<label className="flex flex-col gap-1">
				<span className="text-xs uppercase tracking-wider">Product name</span>
				<input
					type="text"
					className="input input-bordered input-sm"
					value={productName}
					onChange={(e) => setProductName(e.target.value)}
					data-testid="first-run-product-name"
				/>
			</label>
			<label className="flex flex-col gap-1">
				<span className="text-xs uppercase tracking-wider">Brief</span>
				<textarea
					className="textarea textarea-bordered min-h-[6rem]"
					value={brief}
					onChange={(e) => setBrief(e.target.value)}
					data-testid="first-run-brief"
				/>
			</label>
			{err && (
				<div role="alert" className="text-error text-sm" data-testid="first-run-team-error">
					{err}
				</div>
			)}
			<div className="flex gap-2">
				<button
					type="button"
					className="btn btn-sm btn-primary"
					disabled={submitting || productName.trim().length === 0 || brief.trim().length === 0}
					onClick={() => void submit(false)}
					data-testid="first-run-team-create"
				>
					{submitting ? "Creating…" : "Create team"}
				</button>
				<button
					type="button"
					className="btn btn-sm btn-ghost"
					disabled={submitting}
					onClick={() => void submit(true)}
					data-testid="first-run-team-skip"
				>
					Skip for now
				</button>
			</div>
		</fieldset>
	);
}

function DoneStep({ onComplete }: { onComplete: () => Promise<void> }): JSX.Element {
	const navigate = useNavigate();
	const [submitting, setSubmitting] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	const finish = useCallback(async (): Promise<void> => {
		setSubmitting(true);
		setErr(null);
		try {
			const res = await fetch("/api/first-run/complete", { method: "POST" });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			await onComplete();
			navigate("/conversations/review");
		} catch (caught) {
			setErr(caught instanceof Error ? caught.message : String(caught));
		} finally {
			setSubmitting(false);
		}
	}, [onComplete, navigate]);

	return (
		<div className="flex flex-col gap-3" data-testid="first-run-done">
			<p className="text-sm text-[var(--text-mid)]">
				Your factory is ready. We'll drop you on the Conversations surface — press <kbd>?</kbd>{" "}
				anytime to revisit the verdict-grammar coach.
			</p>
			{err && (
				<div role="alert" className="text-error text-sm">
					{err}
				</div>
			)}
			<div>
				<button
					type="button"
					className="btn btn-sm btn-primary"
					disabled={submitting}
					onClick={() => void finish()}
					data-testid="first-run-finish"
				>
					{submitting ? "Finishing…" : "Enter HyperIdle"}
				</button>
			</div>
		</div>
	);
}
