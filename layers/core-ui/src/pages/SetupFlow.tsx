/**
 * SetupFlow — initial setup page at /setup.
 *
 * Simplified single-scroll form. A name, an agent engine, and one optional
 * field (repo path). Team is created silently with defaults. "Start HyperIdle"
 * is disabled until the chosen engine can actually run.
 *
 * Submits two `edit_user` calls:
 * 1. the person, with a team named from the repo folder basename or "My Team"
 *    (and the folder, if one was picked)
 * 2. their owned assistant, on the picked harness, with no identity text and
 *    one subscription per object event, none with a prompt
 * On success: navigate to /work?onboarding=true.
 *
 * @lore P4: Replaces Onboarding.tsx. Single-scroll layout from approved design.
 * @lore R2: Simplified from P4 — removed email, backend mode, team name fields.
 * Team name is derived from repo folder basename or defaults to "My Team".
 * Navigates to /work (was /work/portfolio, was /conversations). AD9: unconditional
 * → /work; WorkOverview handles 1-team short-circuit → team page.
 * @lore visual-parity: Redesigned to match onboarding.html exactly — 3-card
 * abstract visual, step title, step description, left-aligned layout, form-group
 * spacing of 18px, design-system Input + Button components.
 * @lore AE2: Navigates to /work?onboarding=true to trigger assistant overlay auto-open.
 * @lore AV1: Harness picker added (greyed non-installed rows per Decision 4).
 * derivePrimaryHarness() wired into the assistant's edit_user call.
 * Folder → inspect-path (plumbing, kept) + folders.add on the person's edit_user
 * call (best-effort, writeback:"none").
 * @lore AW1 + follow-up: setup collects no credential at all. A harness arrives
 * already logged in, or it is not choosable — the key lives in the harness's own
 * login, never in HyperIdle.
 * @lore BC5 T10: the door swap — the pre-auth `POST /users` → `POST /teams` →
 * `POST /filesystems` sequence becomes `edit_user` calls (person with
 * team, then their owned assistant); `open_user({})` replaces `GET
 * /api/harnesses` for the picker (a rowless caller gets `user: null` and the
 * machine's `runsOn` in the same answer, architecture.md §0.4, §7).
 * `POST /filesystems/inspect-path` stays — it is plumbing, not an action.
 */

import { type ActionResult, type EditUserInput, OBJECT_EVENTS } from "@hyperidle/domain-model";
import {
	derivePrimaryHarness,
	type HarnessCapabilityDescriptor,
} from "@hyperidle/harness-capability";
import {
	type ChangeEvent,
	type FormEvent,
	type JSX,
	useCallback,
	useEffect,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, PageHeader, PageScaffold } from "../ds";
import { apiFetch } from "../services/api-fetch.js";
import { call } from "../services/call.js";

/** First problem message off a failed action result, or a generic fallback. */
function personResultMessage(result: ActionResult<unknown>): string {
	if (result.ok) return "Something went wrong";
	return result.problems[0]?.message ?? "Something went wrong";
}

// @lore BA9g: the "What are you building?" step is GONE, with the presets, the
// custom function chips and the roster preview that promised "Creates: Builder,
// Product Manager, QA Engineer". A team no longer arrives with a roster — it is
// one empty agent, and you improve it with plugins — so the question had no
// answer left to act on.

// ── Harness picker helpers ────────────────────────────────────────────────────

/**
 * A row is choosable (radio-selectable) when the harness is ready to run — which
 * means installed AND signed in. Everything else is greyed.
 *
 * @lore AV1 Decision 4: greyed rows render but are NOT choosable; the greyed
 * affordance IS the actionable element (install hint), not a dead radio.
 *
 * @lore A key-accepting harness used to stay choosable while unauthenticated,
 * because entering a key here was how it became authenticated. Setup collects no
 * key any more, so "not signed in" is not a state this screen can move you out
 * of — the login command on the greyed row is.
 */
function isChoosable(d: HarnessCapabilityDescriptor): boolean {
	return d.discovery.state === "ready";
}

/** Install-hint copy derived from authAction (greyed rows). */
function installHintText(d: HarnessCapabilityDescriptor): string {
	if (d.authAction.kind === "native_cli_login") return "Install to use";
	if (d.authAction.kind === "enter_api_key") return "Add API key to use";
	return "Not available";
}

/** State hint for choosable rows. */
function stateHintText(d: HarnessCapabilityDescriptor): string {
	if (d.discovery.state === "ready") return "Ready";
	if (d.discovery.state === "unauthenticated") return "Sign in to use";
	if (d.discovery.state === "installed") return "Installed – sign in";
	return "Not installed";
}

// @lore The setup screen used to collect an API key, a provider, and a model, and
// write the key into HyperIdle's credential store for a harness to run on. That
// path is gone: the harness is what a person brings, and the key lives in the
// harness's own login. Nothing here holds a model credential, so the OpenRouter
// catalogue fetch that populated the model picker went with it.

// ── Folder inspection result ──────────────────────────────────────────────────

interface FolderInfo {
	path: string;
	isGitRepo: boolean;
	branch: string | null;
}

/**
 * Abstract 3-card welcome illustration.
 *
 * @lore UI-109: The previous version used grey bg-[var(--border-subtle)] bars
 * that looked identical to loading skeletons. Replaced with labelled cards so
 * the illustration reads as intentional, not as "the page is still loading".
 * Each card previews one of the three main areas of HyperIdle.
 */
function WelcomeVisual(): JSX.Element {
	const cards = [
		{ color: "var(--accent-primary)", label: "Conversations", hint: "Chat with agents" },
		{ color: "var(--accent-secondary)", label: "Work", hint: "Bets & tasks" },
		{ color: "var(--status-info)", label: "Knowledge", hint: "Shared docs" },
	] as const;

	return (
		<div
			data-testid="onboarding-illustration"
			aria-hidden="true"
			className="flex gap-[9px] bg-[var(--surface-page)] rounded-[var(--r-subtle)] p-[12px] mb-[24px]"
		>
			{cards.map((card) => (
				<div
					key={card.label}
					className="flex-1 bg-[var(--surface-elevated)] rounded-[var(--r-subtle)] p-[9px]"
				>
					<div className="flex items-center gap-[6px] mb-[6px]">
						<span
							className="block w-[8px] h-[8px] rounded-[var(--r-pill)] shrink-0"
							style={{ background: card.color }}
						/>
						<span className="type-label  truncate" style={{ color: card.color }}>
							{card.label}
						</span>
					</div>
					<span className="type-metadata  text-[var(--text-tertiary)]">{card.hint}</span>
				</div>
			))}
		</div>
	);
}

export function SetupFlow(): JSX.Element {
	const navigate = useNavigate();

	// Form state
	const [name, setName] = useState("");
	const [repoPath, setRepoPath] = useState("");

	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	// Harness discovery — fetch on mount. We never block setup on it.
	const [descriptors, setDescriptors] = useState<HarnessCapabilityDescriptor[]>([]);
	const [harnessLoaded, setHarnessLoaded] = useState(false);
	// The selected primary harness. Empty until discovery answers, which replaces
	// it with the first row this machine can actually run. There is no fallback
	// harness to pre-select any more — every harness is one the person installed.
	const [selectedHarnessType, setSelectedHarnessType] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		call("open_user", {})
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setHarnessLoaded(true);
					return;
				}
				const list: HarnessCapabilityDescriptor[] = [...result.data.runsOn];
				setDescriptors(list);
				// Preselect the first harness this machine can actually run, so the
				// form opens on a real choice rather than a name that may not be here.
				const firstChoosable = list.find((d) => isChoosable(d));
				if (firstChoosable) setSelectedHarnessType(firstChoosable.type);
				setHarnessLoaded(true);
			})
			.catch(() => {
				if (!cancelled) setHarnessLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// Folder inspection result for confirmation row.
	const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);

	const selectedDescriptor = descriptors.find((d) => d.type === selectedHarnessType);

	// Nothing on this machine can run an agent. Finishing setup here would hand
	// someone a workspace whose agents silently fail, with nothing on screen
	// saying why — so it does not finish.
	// An EMPTY list is discovery telling us nothing — it failed, or answered with
	// something that was not a list at all. Blocking on that would strand someone
	// over a probe error rather than a real absence, so only a list that came back
	// populated and choosable-free counts as "this machine cannot run an agent".
	// Same rule the model checks follow: an absent list never rejects.
	const choosableHarnesses = descriptors.filter((d) => isChoosable(d));
	const noHarnessAvailable =
		harnessLoaded && descriptors.length > 0 && choosableHarnesses.length === 0;

	// R2: Start requires a name, and a machine that can actually run an agent.
	const canStart = name.trim().length > 0 && !noHarnessAvailable && !submitting;

	const handleFolderPick = useCallback(async (): Promise<void> => {
		const folder = await window.__HYPERIDLE__?.shell.selectFolder();
		if (!folder) return;
		setRepoPath(folder);
		// Probe the picked folder to determine git status + branch for confirm row.
		// Best-effort — failure just clears folderInfo (no confirmation row shown).
		try {
			const res = await apiFetch("/api/filesystems/inspect-path", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path: folder }),
			});
			if (res.ok) {
				const info = (await res.json()) as {
					exists: boolean;
					isGitRepo: boolean;
					branch: string | null;
				};
				setFolderInfo({ path: folder, isGitRepo: info.isGitRepo, branch: info.branch });
			} else {
				setFolderInfo({ path: folder, isGitRepo: false, branch: null });
			}
		} catch {
			setFolderInfo({ path: folder, isGitRepo: false, branch: null });
		}
	}, []);

	// Derive the primaryHarness from the chosen picker row.

	// Submit and navigate to /work?onboarding=true
	const handleSubmit = useCallback(
		async (e: FormEvent): Promise<void> => {
			e.preventDefault();
			if (!canStart) return;

			setSubmitting(true);
			setSubmitError(null);

			try {
				// @lore R2: team name is not user-visible in setup. Derive from repo
				// folder basename if a path was given; otherwise use "My Team".
				// Z8-158: split on both / and \ to handle Windows paths (C:\repos\app).
				const derivedTeamName = repoPath.trim()
					? (repoPath.trim().split(/[/\\]/).filter(Boolean).pop() ?? "My Team")
					: "My Team";

				// Build primaryHarness for the chosen row. Absent only when
				// discovery never resolved — there is no default harness to fall back
				// to any more, so the server is told nothing rather than told wrong.
				const primaryHarness = selectedDescriptor
					? derivePrimaryHarness(selectedDescriptor)
					: undefined;

				// @lore A step here wrote the key someone typed into HyperIdle's
				// credential store, so a harness could be run on it. Setup asks for no
				// key at all now — a harness arrives already logged in, or it is not
				// choosable.

				// Best-effort folder body (the inspect result determines
				// kind code+branch | doc_set; writeback:"none" is the literal).
				// Attached to the person's own edit_user call below — folders are a
				// user attribute, given to the team it names.
				let folderAdd: EditUserInput["folders"] | undefined;
				const path = repoPath.trim();
				if (path) {
					let info = folderInfo?.path === path ? folderInfo : null;
					if (info === null) {
						try {
							const inspectRes = await apiFetch("/api/filesystems/inspect-path", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ path }),
							});
							if (inspectRes.ok) {
								const raw = (await inspectRes.json()) as {
									exists: boolean;
									isGitRepo: boolean;
									branch: string | null;
								};
								info = { path, isGitRepo: raw.isGitRepo, branch: raw.branch };
							}
						} catch {
							// inspection failed — degrade to doc_set
						}
					}
					const branch = info?.branch ?? null;
					const isCode = info?.isGitRepo === true && branch != null && branch !== "";
					folderAdd = {
						add: [
							{
								kind: isCode ? "code" : "doc_set",
								resourceRef: isCode
									? { kind: "code", repo: path, branch }
									: { kind: "doc_set", folder: path },
								writeback: "none",
								connectionId: null,
							},
						],
					};
				}

				// 1. The person — creates their team by name, and its folder if picked.
				const personResult = await call("edit_user", {
					kind: "human",
					name: name.trim(),
					team: { name: derivedTeamName },
					...(folderAdd ? { folders: folderAdd } : {}),
				});
				if (!personResult.ok || personResult.data.user === null) {
					throw new Error(
						personResult.ok ? "Failed to create user" : personResultMessage(personResult),
					);
				}
				const createdUserId = personResult.data.user.id;

				// 2. Their owned assistant — the one agent a fresh install has.
				// @lore The install ships empty: no identity text and nine
				// subscriptions, one per object event, none with a prompt. The
				// assistant is owned, so it takes its owner's team and hears that
				// team's changes; with no prompt it is woken with what happened and
				// decides for itself. One row per event, never a wildcard — a person
				// edits or pauses each reaction on its own. The prompts fill only
				// when the person writes them; a plugin brings its own agents and
				// never writes into these.
				const assistantResult = await call("edit_user", {
					kind: "ai",
					name: `${name.trim()}'s Assistant`,
					role: "assistant",
					agentCategory: "individual",
					ownerUserId: createdUserId,
					...(primaryHarness ? { runConfig: primaryHarness } : {}),
					subscriptions: { add: OBJECT_EVENTS.map((event) => ({ event })) },
				});
				if (!assistantResult.ok) {
					throw new Error(personResultMessage(assistantResult));
				}

				// Navigate to /work?onboarding=true to trigger assistant overlay auto-open.
				// Was /work/portfolio; WorkOverview handles 1-team short-circuit.
				navigate("/work?onboarding=true");
			} catch (err: unknown) {
				setSubmitError(err instanceof Error ? err.message : "Something went wrong");
				setSubmitting(false);
			}
		},
		[canStart, name, repoPath, navigate, selectedDescriptor, folderInfo],
	);

	return (
		<PageScaffold header={<PageHeader title="Setup" />}>
			{/* W3 AC-53: Card with shadow */}
			<div
				data-testid="onboarding-card"
				className="w-[calc(100%-48px)] max-w-[520px] mx-auto my-[24px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)] p-[48px]"
			>
				{/* Brand + tagline */}
				<div
					data-testid="onboarding-brand"
					className="type-title   text-[var(--text-primary)]  mb-[6px]"
				>
					HyperIdle
				</div>
				<p className="type-copy  text-[var(--text-secondary)]  mb-[36px]">
					Your agentic operating system. Humans steer, agents build.
				</p>

				{/* W3 AC-53: Abstract 3-card illustration */}
				<WelcomeVisual />

				{/* Step heading */}
				<p className="type-title   text-[var(--text-primary)]  mb-[9px]">Set up your workspace</p>
				<p className="type-copy  text-[var(--text-secondary)]  mb-[24px]">
					Tell us your name and pick the engine your agents think with. Bring an API key, or use a
					coding CLI you are already signed in to.
				</p>

				<form onSubmit={handleSubmit} className="flex flex-col">
					{/* W3 AC-54: "Your name" label (required) */}
					<div className="mb-[18px]">
						<Input
							id="setup-name"
							label="Your name"
							type="text"
							placeholder="Your name"
							value={name}
							onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
							required
							autoFocus
						/>
					</div>

					{/* Harness picker — agent engine selection */}
					<div className="mb-[18px]" role="radiogroup" aria-label="Agent harness">
						<p className="type-small   text-[var(--text-primary)] mb-[6px]">
							Agent harness{" "}
							<span className="type-small  text-[var(--text-tertiary)]">
								(the default engine for every agent on your team)
							</span>
						</p>
						{/* ONE bordered container with hairline-divided rows — same as SettingsHarnesses */}
						<div className="border-width-thin  border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden">
							{/* Discovered harness rows — rendered after discovery resolves */}
							{harnessLoaded &&
								descriptors.map((d) => {
									const choosable = isChoosable(d);
									const isSelected = selectedHarnessType === d.type;
									return (
										// The group wraps the selectable row AND the key fields that
										// belong to it, so "this field belongs to this harness" is a
										// structural fact a test can read, not a layout coincidence.
										<div key={d.type} data-testid={`harness-group-${d.type}`}>
											<div className="h-px bg-[var(--border-subtle)]" />
											{choosable ? (
												<label
													data-testid={`harness-row-${d.type}`}
													className={`flex items-center gap-[9px] px-[12px] py-[12px] cursor-pointer${isSelected ? " bg-[var(--accent-primary-dim)]" : ""}`}
												>
													<input
														type="radio"
														data-testid={`harness-radio-${d.type}`}
														name="primary-harness"
														value={d.type}
														checked={isSelected}
														onChange={() => setSelectedHarnessType(d.type)}
														className="radio radio-sm shrink-0"
													/>
													<div className="flex-1 min-w-0">
														<span className="type-copy    text-[var(--text-primary)]">
															{d.name}
														</span>
														<p className="type-metadata  text-[var(--text-tertiary)]  mt-[3px]">
															{stateHintText(d)}
														</p>
													</div>
												</label>
											) : (
												<div
													data-testid={`harness-row-${d.type}`}
													aria-disabled="true"
													className="flex items-center gap-[9px] px-[12px] py-[12px] opacity-60"
												>
													<span className="shrink-0 w-[16px] h-[16px]" aria-hidden="true" />
													<div className="flex-1 min-w-0">
														<span className="type-copy    text-[var(--text-secondary)]">
															{d.name}
														</span>
														<p className="type-metadata  text-[var(--text-tertiary)]  mt-[3px]">
															{installHintText(d)}
														</p>
													</div>
												</div>
											)}
										</div>
									);
								})}
						</div>
						{noHarnessAvailable && (
							<div
								data-testid="no-harness-available"
								role="alert"
								className="border-width-thin  border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] mt-[9px] px-[12px] py-[12px]"
							>
								<p className="type-copy   text-[var(--text-primary)]">
									No agent harness is ready on this machine
								</p>
								<p className="type-metadata  text-[var(--text-tertiary)]  mt-[3px]">
									HyperIdle runs your agents through a coding CLI you install and sign into. Install
									one, sign in, then reopen HyperIdle.
								</p>
								<ul className="mt-[9px] flex flex-col gap-[6px]">
									{descriptors.map((d) => (
										<li key={d.type}>
											<span className="type-small   text-[var(--text-primary)]">{d.name}</span>
											<span className="type-metadata  text-[var(--text-tertiary)]">
												— {d.discovery.reason ?? installHintText(d)}
											</span>
											{d.authAction.kind === "native_cli_login" && d.authAction.command && (
												<code className="type-metadata  text-[var(--text-secondary)]  ml-[6px]">
													{d.authAction.command.join(" ")}
												</code>
											)}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>

					{/* Repo path (optional) */}
					<div className="mb-[18px]">
						<div className="flex flex-col gap-[6px]">
							<label htmlFor="setup-repo" className="type-small   text-[var(--text-primary)]">
								Project folder{" "}
								<span className="type-small  text-[var(--text-tertiary)]">(optional)</span>
							</label>
							{/*
							 * @lore AZ7 B2 (review round 1): was a hand-rolled <input>
							 * reproducing Input's own recipe (bg-surface-elevated,
							 * border-default 1.5px, rounded-default) plus a raw hex-alpha
							 * focus shadow instead of the --accent-primary-dim token, with
							 * the "browse folder" button absolutely positioned INSIDE the
							 * input's padding. Migrated to the design-system Input; the
							 * browse button moves beside the field (Button size="icon")
							 * instead of overlaying it — same affordance, no bespoke
							 * conditional padding needed to keep text clear of the icon.
							 */}
							<div className="flex items-center gap-[6px]">
								{window.__HYPERIDLE__?.shell?.selectFolder && (
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label="Browse for folder"
										onClick={handleFolderPick}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="14"
											height="14"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
											aria-hidden="true"
										>
											<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
										</svg>
									</Button>
								)}
								<Input
									id="setup-repo"
									type="text"
									className="flex-1"
									placeholder="/Users/you/my-project"
									value={repoPath}
									onChange={(e) => setRepoPath(e.target.value)}
								/>
							</div>
							<span className="type-metadata  text-[var(--text-tertiary)]">
								Path to a git repository for agents to work in.
							</span>
							{/* Folder confirm row — shows after folder picked/detected */}
							{folderInfo && (
								<div className="flex items-center gap-[6px] mt-[3px]">
									<span className="type-data   text-[var(--text-primary)]">
										{folderInfo.path.split(/[/\\]/).filter(Boolean).pop() ?? folderInfo.path}
									</span>
									{folderInfo.isGitRepo && folderInfo.branch ? (
										<span className="type-data   text-[var(--text-tertiary)]">
											@{folderInfo.branch}
										</span>
									) : (
										<span className="type-metadata  text-[var(--text-tertiary)]">folder</span>
									)}
								</div>
							)}
						</div>
					</div>

					{/* Validation / submit error */}
					{submitError && (
						<p
							role="alert"
							aria-live="polite"
							className="type-small  text-[var(--status-error)] mb-[18px]"
						>
							{submitError}
						</p>
					)}

					{/* Submit — left-aligned, no border separator */}
					<div>
						<Button type="submit" variant="primary" disabled={!canStart}>
							{submitting && <span className="loading loading-spinner loading-xs" />}
							Start HyperIdle
						</Button>
					</div>
				</form>
			</div>
		</PageScaffold>
	);
}
