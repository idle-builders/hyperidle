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

function personResultMessage(result: ActionResult<unknown>): string {
	if (result.ok) return "Something went wrong";
	return result.problems[0]?.message ?? "Something went wrong";
}

function isChoosable(d: HarnessCapabilityDescriptor): boolean {
	return d.discovery.state === "ready";
}

function installHintText(d: HarnessCapabilityDescriptor): string {
	if (d.authAction.kind === "native_cli_login") return "Install to use";
	if (d.authAction.kind === "enter_api_key") return "Add API key to use";
	return "Not available";
}

function stateHintText(d: HarnessCapabilityDescriptor): string {
	if (d.discovery.state === "ready") return "Ready";
	if (d.discovery.state === "unauthenticated") return "Sign in to use";
	if (d.discovery.state === "installed") return "Installed – sign in";
	return "Not installed";
}

interface FolderInfo {
	path: string;
	isGitRepo: boolean;
	branch: string | null;
}

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

	const [name, setName] = useState("");
	const [repoPath, setRepoPath] = useState("");

	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	const [descriptors, setDescriptors] = useState<HarnessCapabilityDescriptor[]>([]);
	const [harnessLoaded, setHarnessLoaded] = useState(false);
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

	const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);

	const selectedDescriptor = descriptors.find((d) => d.type === selectedHarnessType);

	// @lore: noHarnessAvailable — empty list is a probe error, not absence; only a populated choosable-free list blocks
	const choosableHarnesses = descriptors.filter((d) => isChoosable(d));
	const noHarnessAvailable =
		harnessLoaded && descriptors.length > 0 && choosableHarnesses.length === 0;

	const canStart = name.trim().length > 0 && !noHarnessAvailable && !submitting;

	const handleFolderPick = useCallback(async (): Promise<void> => {
		const folder = await window.__HYPERIDLE__?.shell.selectFolder();
		if (!folder) return;
		setRepoPath(folder);
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

	const handleSubmit = useCallback(
		async (e: FormEvent): Promise<void> => {
			e.preventDefault();
			if (!canStart) return;

			setSubmitting(true);
			setSubmitError(null);

			try {
				const derivedTeamName = repoPath.trim()
					? (repoPath.trim().split(/[/\\]/).filter(Boolean).pop() ?? "My Team")
					: "My Team";

				const primaryHarness = selectedDescriptor
					? derivePrimaryHarness(selectedDescriptor)
					: undefined;

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

				// @lore: owned assistant — ships empty (no identity, no prompts); one subscription per object event; never a wildcard; plugin agents never write into these
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
			<div
				data-testid="onboarding-card"
				className="w-[calc(100%-48px)] max-w-[520px] mx-auto my-[24px] bg-[var(--surface-elevated)] rounded-[var(--r-default)] shadow-[var(--shadow-elevated)] p-[48px]"
			>
				<div
					data-testid="onboarding-brand"
					className="type-title   text-[var(--text-primary)]  mb-[6px]"
				>
					HyperIdle
				</div>
				<p className="type-copy  text-[var(--text-secondary)]  mb-[36px]">
					Your agentic operating system. Humans steer, agents build.
				</p>

				<WelcomeVisual />

				<p className="type-title   text-[var(--text-primary)]  mb-[9px]">Set up your workspace</p>
				<p className="type-copy  text-[var(--text-secondary)]  mb-[24px]">
					Tell us your name and pick the engine your agents think with. Bring an API key, or use a
					coding CLI you are already signed in to.
				</p>

				<form onSubmit={handleSubmit} className="flex flex-col">
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

					<div className="mb-[18px]" role="radiogroup" aria-label="Agent harness">
						<p className="type-small   text-[var(--text-primary)] mb-[6px]">
							Agent harness{" "}
							<span className="type-small  text-[var(--text-tertiary)]">
								(the default engine for every agent on your team)
							</span>
						</p>
						<div className="border-width-thin  border-[var(--border-subtle)] rounded-[var(--r-default)] bg-[var(--surface-elevated)] shadow-[var(--shadow-default)] overflow-hidden">
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

					<div className="mb-[18px]">
						<div className="flex flex-col gap-[6px]">
							<label htmlFor="setup-repo" className="type-small   text-[var(--text-primary)]">
								Project folder{" "}
								<span className="type-small  text-[var(--text-tertiary)]">(optional)</span>
							</label>
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

					{submitError && (
						<p
							role="alert"
							aria-live="polite"
							className="type-small  text-[var(--status-error)] mb-[18px]"
						>
							{submitError}
						</p>
					)}

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
