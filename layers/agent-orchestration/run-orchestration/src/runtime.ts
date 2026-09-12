import { randomUUID } from "node:crypto";
import { type AgentSessionRequest, type HyperIdleDb, sessions } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type {
	BakedAgentRunnableConfig,
	BakedContextBundle,
	BakedSessionResumeRequest,
} from "@hyperidle/domain-model";
import {
	type AgentSessionSourceCorrelation,
	type AgentSessionSourceKind,
	agentSessionRequestInputSchema,
} from "@hyperidle/domain-model";
import type { ConversationMessage } from "@hyperidle/harness-protocol";
import { and, eq } from "drizzle-orm";
import { createContextAssembler } from "./context.js";
import type {
	AdmittedRun,
	HarnessPortDeps,
	RunContextBundle,
	RunOptions,
	RunResult,
	RuntimeDeps,
	RuntimePorts,
} from "./contracts.js";
import {
	ConcurrencyLimitError,
	FilesystemUnavailableError,
	isAgentWorkIntentKind,
	isAgentWorkIntentSourceKind,
	TargetAgentNotRunnableError,
} from "./errors.js";
import { createProvisioner } from "./provisioner.js";

const logger = createLogger({ pkg: "run-orchestration.runtime" });

type RuntimeProvisionDeps = HarnessPortDeps<HyperIdleDb>;
type ExecutionPorts = Omit<RuntimePorts, "sessionProvisioner"> & {
	readonly sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]>;
};

function admitOnlyWithRequestLease(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string; now?: Date },
	ports: ExecutionPorts,
): Promise<boolean> {
	return ports.sessionRequests.findSessionRequest(db, {
		by: "claimActive",
		requestId: input.requestId,
		claimToken: input.claimToken,
		now: input.now ?? new Date(),
	}) as Promise<boolean>;
}

async function reserveOrAdoptSession(
	db: HyperIdleDb,
	input: { requestId: string; claimToken: string },
	ports: ExecutionPorts,
): Promise<{ adopted: boolean; sessionId: string }> {
	if (!(await admitOnlyWithRequestLease(db, input, ports))) {
		throw new Error(`Request ${input.requestId} is not owned by this claim`);
	}
	const [existing] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.requestId, input.requestId))
		.limit(1);
	if (existing) return { adopted: true, sessionId: existing.id };
	const request = await ports.sessionRequests.findSessionRequest(db, {
		by: "id",
		requestId: input.requestId,
	});
	if (!request) {
		throw new Error(`Unknown agent session request ${input.requestId}`);
	}
	const agentId = request.agentId;
	const now = new Date().toISOString();
	const sessionId = randomUUID();
	await db.insert(sessions).values({
		id: sessionId,
		requestId: input.requestId,
		taskId: request.taskId ?? null,
		agentId,
		modelTier: "fast",
		startedAt: now,
		state: "active",
		sourceKind: request.sourceKind,
		sourceId: request.sourceId,
		sourceCorrelationJson: request.sourceCorrelationJson,
	});
	const [winner] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.requestId, input.requestId))
		.limit(1);
	if (!winner) throw new Error(`Failed to reserve session for ${input.requestId}`);
	return { adopted: true, sessionId: winner.id };
}

/**
 * Close out the session `reserveOrAdoptSession` reserved for a request whose
 * admission then failed. CAS'd on `state:"active"` (the same guard
 * `start-runtime.ts`'s boot sweep uses) so a concurrent legitimate end wins
 * and this becomes a no-op rather than clobbering it.
 */
async function endReservedSessionAfterFailedAdmission(
	db: HyperIdleDb,
	requestId: string,
): Promise<void> {
	await db
		.update(sessions)
		.set({ state: "crashed", outcome: "crashed", endedAt: new Date().toISOString() })
		.where(and(eq(sessions.requestId, requestId), eq(sessions.state, "active")));
}

/**
 * BA5 §4.2/§13 (L5) — the filesystem-hold's own reserved-row cleanup: DELETED,
 * not crashed. `reserveOrAdoptSession` adopts any existing row for a request
 * (this file's `reserveOrAdoptSession`, above); a crashed row would be
 * adopted by the retry that follows the request back to `pending`, and the
 * retry would then find a session that never ran. Nothing references the row
 * yet at this point — `session_started` only fires at the end of a
 * successful admission, and `agent_session_requests.session_id` only on
 * `running` — so the delete is safe; it fails loudly on a foreign-key
 * violation if that ever stops being true. Also keeps the row out of the
 * concurrency count the NEXT attempt reads.
 */
async function deleteReservedSessionAfterFilesystemHold(
	db: HyperIdleDb,
	requestId: string,
): Promise<void> {
	await db
		.delete(sessions)
		.where(and(eq(sessions.requestId, requestId), eq(sessions.state, "active")));
}

function parseCorrelation(request: AgentSessionRequest): AgentSessionSourceCorrelation {
	const parsed = JSON.parse(request.sourceCorrelationJson) as AgentSessionSourceCorrelation;
	agentSessionRequestInputSchema.parse({
		sourceKind: request.sourceKind,
		sourceId: request.sourceId,
		streamId: request.streamId,
		taskId: request.taskId,
		agentId: request.agentId,
		teamId: request.teamId ?? undefined,
		userId: request.userId ?? undefined,
		promptMode: request.promptMode,
		idempotencyKey: request.idempotencyKey,
		payloadJson: request.payloadJson ?? undefined,
		sourceCorrelation: parsed,
	});
	return parsed;
}

/**
 * AU21 §9 Increment 12 (Decision H3): the `task_run`/`routine_run`/
 * baked entity+knowledge bundle, carried on
 * `request.payloadJson` the same way Increment 11's `transcript`/`modelId`
 * ride it (`session-requests/src/service.ts`'s `createFromBakedRequestInternal`).
 */
/** @lore BA2: the resume a `review_resume` request carries. Absent for every other kind. */
function parseBakedResume(request: AgentSessionRequest): BakedSessionResumeRequest | undefined {
	if (!request.payloadJson) return undefined;
	const payload = JSON.parse(request.payloadJson) as { resume?: BakedSessionResumeRequest };
	return payload?.resume;
}

function parseBakedContextBundle(request: AgentSessionRequest): BakedContextBundle | undefined {
	if (!request.payloadJson) return undefined;
	const payload = JSON.parse(request.payloadJson) as unknown;
	if (!payload || typeof payload !== "object" || !("contextBundle" in payload)) return undefined;
	return (payload as { contextBundle?: BakedContextBundle }).contextBundle;
}

/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — every intent kind's baked
 * agent-runnability snapshot, carried on `request.payloadJson` the same way
 * `contextBundle`/`transcript`/`modelId` ride it
 * (`session-requests/src/service.ts`'s `createFromBakedRequestInternal`).
 * Feeds `admitSession`'s Phase 1 (see `provisioner.ts`'s Wave E note) — a
 * missing bake is a hard provisioning failure there, not a silent allow.
 */
/**
 * @lore AU27 Increment 6 (Decision 4) exported this so `start-runtime.ts`'s
 * drain could read the target agent's baked `modelId`/`modelProvider` override
 * up front. AU26 G1 moved those two columns into `agent_run_config`, so the
 * drain reads them LIVE through `ports.agentRunConfig` instead and this parse
 * is module-internal again — the bake it reads now carries only the four
 * genuinely-core fields (`kind`/`status`/`role`/`teamId`).
 */
function parseBakedAgentConfig(request: AgentSessionRequest): BakedAgentRunnableConfig | undefined {
	if (!request.payloadJson) return undefined;
	const payload = JSON.parse(request.payloadJson) as unknown;
	if (!payload || typeof payload !== "object" || !("agentConfig" in payload)) return undefined;
	return (payload as { agentConfig?: BakedAgentRunnableConfig }).agentConfig;
}

/**
 * AU21 §9 Increment 12 (Decision H3), Wave E — the server's baked
 * disabled-harness-types list, carried on `request.payloadJson` alongside
 * `agentConfig`. Feeds `admitSession`'s Phase 3 adapter-selection filter.
 */
function parseBakedHarnessDisabled(request: AgentSessionRequest): readonly string[] | undefined {
	if (!request.payloadJson) return undefined;
	const payload = JSON.parse(request.payloadJson) as unknown;
	if (!payload || typeof payload !== "object" || !("harnessDisabled" in payload)) return undefined;
	return (payload as { harnessDisabled?: readonly string[] }).harnessDisabled;
}

/**
 * AU27 — the session's calling thread id, carried on `request.payloadJson`
 * the same way Increment 11's `transcript`/`modelId` ride it
 * (`session-requests/src/service.ts`'s `createFromBakedRequestInternal`).
 * Absent only for `routine_run`, which has no thread host to resolve one
 * from.
 */
function parseBakedCallingThreadId(request: AgentSessionRequest): string | undefined {
	if (!request.payloadJson) return undefined;
	const payload = JSON.parse(request.payloadJson) as unknown;
	if (!payload || typeof payload !== "object" || !("callingThreadId" in payload)) return undefined;
	return (payload as { callingThreadId?: string }).callingThreadId;
}

/** One raw transcript row — matches `@hyperidle/conversation`'s `resolveAssistantTurnRequest`'s `BakedTranscriptRow`. */
interface BakedTranscriptRow {
	readonly senderId: string;
	readonly payload: string;
	readonly type: string;
}

/**
 * AU27 Increment 4 (Decision 2) — the session's baked raw transcript rows,
 * carried on `request.payloadJson` the same way `callingThreadId`/
 * `contextBundle`/`agentConfig` ride it. Absent for a session with no
 * transcript (every kind except `assistant_turn`, today).
 */
function parseBakedTranscript(
	request: AgentSessionRequest,
): readonly BakedTranscriptRow[] | undefined {
	if (!request.payloadJson) return undefined;
	const payload = JSON.parse(request.payloadJson) as unknown;
	if (!payload || typeof payload !== "object" || !("transcript" in payload)) return undefined;
	return (payload as { transcript?: readonly BakedTranscriptRow[] }).transcript;
}

/**
 * AU27 Increment 4 (Decision 2) — relocated VERBATIM from
 * `dispatch/src/service.ts`'s `mapTranscriptToMessages` (the row -> generic
 * chat-message mapping is pure formatting, which belongs orchestration-side
 * under H2, not core-side). Generalized: `assistantAgentId` becomes
 * `agentId` — the session's own running agent, not an assistant-specific
 * concept — so a future non-assistant kind that bakes a transcript gets the
 * same generic mapping with no new branch.
 */
function mapTranscriptToMessages(
	rows: readonly BakedTranscriptRow[],
	agentId: string,
): ConversationMessage[] {
	const result: ConversationMessage[] = [];
	for (const row of rows) {
		if (row.type !== "plain") continue;

		let parsed: { text?: string; notice?: unknown };
		try {
			parsed = JSON.parse(row.payload) as { text?: string; notice?: unknown };
		} catch {
			continue;
		}
		if (parsed.notice !== undefined) continue;
		if (typeof parsed.text !== "string" || parsed.text.trim() === "") continue;

		const role: "user" | "assistant" = row.senderId === agentId ? "assistant" : "user";
		result.push({ role, content: parsed.text });
	}
	return result;
}

async function ensureClaimedRequest(
	db: HyperIdleDb,
	request: AgentSessionRequest,
	options: Extract<RunOptions, { mode: "durable" }>,
	ports: ExecutionPorts,
): Promise<AgentSessionRequest> {
	void ports;
	if (request.status === "claimed") return request;
	if (request.status !== "pending") {
		throw new Error(`Agent session request ${request.id} is not claimable (${request.status})`);
	}
	const claimed = await ports.sessionRequests.claimSessionRequest(
		db,
		{ id: request.id },
		{
			workerId: options.workerId ?? "local-runtime",
			...(options.claim ?? { now: new Date(), leaseMs: 30_000 }),
		},
	);
	if (!claimed) {
		throw new Error(`Agent session request ${request.id} was already claimed`);
	}
	return claimed;
}

/**
 * AU21 §12 (traced, not guessed): a PRE-admission failure in
 * `runClaimedRequest` is the real "provisioning failed" gap — a deactivated
 * agent (`TargetAgentNotRunnableError`, `provisioner.ts`'s Phase 1 status
 * check) or any other hard infra failure building the session, before it
 * ever started running. Reported back via the SAME pre-handoff
 * `agent_run_admission_failed` channel `failOrRelease` uses (§6 B4) — no
 * bespoke race mechanism. Extracted to keep `runClaimedRequest`'s catch
 * block under the complexity ceiling.
 */
async function reportPreAdmissionProvisioningFailure(
	deps: RuntimeProvisionDeps,
	ports: ExecutionPorts,
	requestId: string,
	err: unknown,
): Promise<void> {
	const correlatedIntent = await ports.sessionRequests.findSessionRequest(deps.db, {
		by: "intentSource",
		requestId,
	});
	if (
		!(
			correlatedIntent &&
			isAgentWorkIntentKind(correlatedIntent.kind) &&
			isAgentWorkIntentSourceKind(correlatedIntent.sourceKind)
		)
	) {
		return;
	}
	// @lore AU29 §2.4: inlined from the framework's (now-deleted)
	// `reportAdmissionFailure` — the typed construction+emit of the
	// pre-handoff `agent_run_admission_failed` channel, at both real call
	// sites (this one and `session-requests`'s `failOrRelease`). The two
	// services deliberately do not import each other; they now share the
	// event *type* (`events.ts`, now in `@hyperidle/domain-model`), not an emit helper.
	deps.eventBus.emit({
		type: "agent_run_admission_failed",
		streamId: `${correlatedIntent.kind}:${correlatedIntent.sourceId}`,
		intentId: correlatedIntent.id,
		kind: correlatedIntent.kind,
		sourceKind: correlatedIntent.sourceKind,
		sourceId: correlatedIntent.sourceId,
		failureCode:
			err instanceof TargetAgentNotRunnableError
				? "TARGET_AGENT_NOT_RUNNABLE"
				: "PROVISIONING_FAILED",
		terminal: true,
		timestamp: Date.now(),
	});
}

async function runClaimedRequest(
	deps: RuntimeProvisionDeps,
	request: AgentSessionRequest,
	provisionParams: RunContextBundle,
	ports: ExecutionPorts,
	options: Pick<Extract<RunOptions, { mode: "durable" }>, "completion">,
): Promise<RunResult> {
	let admitted: AdmittedRun | null = null;
	try {
		if (
			!(
				request.claimToken &&
				(await ports.sessionRequests.renewClaim(deps.db, request.id, request.claimToken, {
					now: new Date(),
					leaseMs: 30_000,
				}))
			)
		) {
			throw new Error(`Lost request custody before admission: ${request.id}`);
		}
		await reserveOrAdoptSession(
			deps.db,
			{ requestId: request.id, claimToken: request.claimToken },
			ports,
		);
		admitted = await ports.sessionProvisioner.admitSession(deps, provisionParams);
		await ports.sessionRequests.transitionSessionRequest(deps.db, {
			to: "running",
			requestId: request.id,
			sessionId: admitted.sessionId,
			claimToken: request.claimToken,
		});
		if (options.completion === "admit") {
			let signalStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				signalStarted = resolve;
			});
			void ports.sessionProvisioner
				.runSession(deps, provisionParams, admitted, signalStarted)
				.then(async () => {
					await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
						requestId: request.id,
						state: "completed",
						sessionId: admitted?.sessionId,
					});
				})
				.catch(async (err) => {
					try {
						if (admitted) {
							await ports.sessionLifecycle.crashSession(
								deps.db,
								deps.eventBus,
								admitted.sessionContext,
							);
						}
					} catch {
						// best-effort last-resort teardown
					}
					// @lore AU9 R1/W1: detached-runtime failure is post-admission — the
					// single terminal writer handles it in ONE transition (CAS + inbox
					// insert). A prior markRequestTerminal-then-transitionAgentRunLifecycle
					// double-write left the second CAS matching zero rows (status already
					// "failed"), losing the inbox row and the lifecycle publish entirely.
					//
					// @lore This transition can itself fail, and it is the last thing in a
					// DETACHED chain — a throw here becomes an unhandled rejection with no
					// caller to see it. The common cause is benign: the CAS matches no row
					// because the request already reached a terminal state, so there is
					// nothing left to transition. It surfaced as "Unknown agent request"
					// noise on the harness lane, where a file whose tests all passed was
					// still reported as failed.
					try {
						await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
							requestId: request.id,
							state: "failed",
							sessionId: admitted?.sessionId,
							failureCode: err instanceof Error ? err.name : "Error",
							errorMessage: err instanceof Error ? err.message : String(err),
						});
					} catch (transitionErr) {
						// Say so rather than swallowing it: the run already failed, and this
						// was the attempt to record that. Losing it silently would leave the
						// request looking un-terminated with no trace of why.
						// biome-ignore lint/suspicious/noConsole: observability adapter not yet stood up
						console.warn(
							`[run-orchestration] could not record terminal failure for request ${request.id}:`,
							transitionErr,
						);
					}
				})
				.finally(() => {
					signalStarted();
				});
			await started;
			return { mode: "admitted", sessionId: admitted.sessionId };
		}
		const result = await ports.sessionProvisioner.runSession(
			deps,
			provisionParams,
			admitted,
			deps.onHarnessStarted,
		);
		await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
			requestId: request.id,
			state: "completed",
			sessionId: admitted.sessionId,
		});
		return { mode: "completed", ...result };
	} catch (err) {
		if (err instanceof ConcurrencyLimitError) {
			if (request.claimToken) {
				await ports.sessionRequests.releaseClaim(deps.db, request.id, request.claimToken);
			}
			throw err;
		}
		// BA5 §4.2/§13 (L5) — the filesystem hold: the same shape as the
		// concurrency release above (claim back to `pending`, no task-failure
		// reporting), plus deleting the reserved row instead of leaving it
		// `active` — see `deleteReservedSessionAfterFilesystemHold`'s own doc.
		// Never reaches the generic failure path below: no
		// `transitionAgentRunLifecycle`, so core never sees a failed dispatch
		// attempt and the task stays exactly where it was.
		if (err instanceof FilesystemUnavailableError) {
			await deleteReservedSessionAfterFilesystemHold(deps.db, request.id);
			if (request.claimToken) {
				await ports.sessionRequests.releaseClaim(deps.db, request.id, request.claimToken);
			}
			throw err;
		}
		logger.error("Agent run failed", {
			requestId: request.id,
			sourceKind: request.sourceKind,
			sourceId: request.sourceId,
			agentId: request.agentId,
			phase: admitted ? "post-admission" : "pre-admission",
			// Spelled out rather than passing `err`: an Error has no enumerable
			// own properties, so it JSON-serializes to `{}` and the log line says
			// a run failed without ever saying why — the same silence this whole
			// change exists to remove.
			errorName: err instanceof Error ? err.name : typeof err,
			errorMessage: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
		});
		// `reserveOrAdoptSession` inserts the session row BEFORE `admitSession`
		// runs, so a pre-admission throw leaves an `active` session behind with
		// no runtime attached to it. Nothing else ends it: the detached-runtime
		// `crashSession` below only fires once `admitted` is set. The result was
		// a product showing an agent working forever on work that had already
		// failed, and a phantom `active` row counting against the agent's own
		// concurrency limit — so the NEXT run could be refused by a session that
		// never started.
		if (!admitted) {
			await endReservedSessionAfterFailedAdmission(deps.db, request.id);
		}
		// @lore AU9 R1: this catch spans both preconditions of the single terminal
		// writer. When `admitted` is set, `markRequestRunning` already succeeded —
		// post-admission (running+sessionId). When it is still null, the failure
		// happened before admission — pre-admission (claimed+claimToken); the
		// `running`-only CAS would silently match zero rows for this branch.
		await ports.sessionLifecycle.transitionAgentRunLifecycle(deps.db, deps.eventBus, {
			requestId: request.id,
			state: "failed",
			sessionId: admitted?.sessionId,
			claimToken: admitted ? undefined : (request.claimToken ?? undefined),
			failureCode: err instanceof Error ? err.name : "Error",
			errorMessage: err instanceof Error ? err.message : String(err),
		});
		// A POST-admission failure (a session actually started, then crashed)
		// is NOT a provisioning failure — the `transitionAgentRunLifecycle`
		// call above already covers that via the existing post-session
		// channel, so only a PRE-admission failure reports here.
		if (!admitted) {
			await reportPreAdmissionProvisioningFailure(deps, ports, request.id, err);
		}
		throw err;
	}
}

async function consumeAgentSessionRequest(
	deps: RuntimeProvisionDeps,
	request: AgentSessionRequest,
	options: Extract<RunOptions, { mode: "durable" }>,
	ports: ExecutionPorts,
): Promise<RunResult> {
	const claimedRequest = await ensureClaimedRequest(deps.db, request, options, ports);
	const sourceCorrelation = parseCorrelation(claimedRequest);
	const contextBundle = parseBakedContextBundle(claimedRequest);
	const agentConfig = parseBakedAgentConfig(claimedRequest);
	const harnessDisabled = parseBakedHarnessDisabled(claimedRequest);
	const callingThreadId = parseBakedCallingThreadId(claimedRequest);
	const rawTranscript = parseBakedTranscript(claimedRequest);
	const transcript = rawTranscript
		? mapTranscriptToMessages(rawTranscript, claimedRequest.agentId)
		: undefined;
	// @lore BA2: a review_resume request carries the resume on its payload. Everything a
	// resume needs was baked when the human decided, so nothing is read here.
	const resume = parseBakedResume(claimedRequest);
	const provisionParams: RunContextBundle = {
		taskId: claimedRequest.taskId,
		agentId: claimedRequest.agentId,
		productId: claimedRequest.teamId ?? "task-free",
		sandboxBasePath: options.sandboxBasePath,
		...(options.modelTier ? { modelTier: options.modelTier } : {}),
		...(options.sessionWorkflow ? { sessionWorkflow: options.sessionWorkflow } : {}),
		...(claimedRequest.sourceKind === "routine" && "routineId" in sourceCorrelation
			? { routineId: sourceCorrelation.routineId }
			: {}),
		...(contextBundle ? { contextBundle } : {}),
		...(agentConfig ? { agentConfig } : {}),
		...(harnessDisabled ? { harnessDisabled } : {}),
		...(callingThreadId ? { callingThreadId } : {}),
		...(transcript ? { transcript } : {}),
		...(resume ? { resume } : {}),
		requestContext: {
			requestId: claimedRequest.id,
			sourceKind: claimedRequest.sourceKind as AgentSessionSourceKind,
			sourceId: claimedRequest.sourceId,
			sourceCorrelation,
		},
	};
	return runClaimedRequest(deps, claimedRequest, provisionParams, ports, options);
}

/** Drive a durable, one-shot, or assembly-only run through one coherent boundary. */
export function runSession(deps: RuntimeDeps, options: RunOptions): Promise<RunResult> {
	if (options.mode === "assemble") {
		if ("assemble" in deps && typeof deps.assemble === "function") {
			return Promise.resolve(deps.assemble(options.input)).then((assembled) => ({
				mode: "assembled",
				context: assembled as Extract<RunResult, { mode: "assembled" }>["context"],
			}));
		}
		const context = createContextAssembler(deps.composition.context);
		return context
			.assembleAgentContext(options.input)
			.then((assembled) => ({ mode: "assembled", context: assembled }));
	}
	if (!(deps.runtime || deps.ports?.sessionProvisioner)) {
		throw new Error("Executable run mode requires harness runtime dependencies");
	}
	const runtime = (deps.runtime ?? deps) as RuntimeProvisionDeps;
	const provisionerComposition = deps.composition?.provisioner;
	if (!(provisionerComposition || deps.ports?.sessionProvisioner)) {
		throw new Error("Executable run mode requires provisioner composition");
	}
	if (options.mode === "durable" && !deps.ports) {
		throw new Error("Durable run mode requires orchestration ports");
	}
	const basePorts = deps.ports;
	let executionProvisioner = basePorts?.sessionProvisioner;
	if (!executionProvisioner) {
		if (!provisionerComposition) throw new Error("Missing provisioner composition");
		const provisioner = createProvisioner({
			...provisionerComposition,
			contextAssembly: createContextAssembler(deps.composition.context),
		});
		executionProvisioner = { admitSession: provisioner.admit, runSession: provisioner.run };
	}
	const ports: ExecutionPorts = {
		...(basePorts ?? ({} as RuntimePorts)),
		sessionProvisioner: executionProvisioner,
	};
	if (options.mode === "durable") {
		return consumeAgentSessionRequest(runtime, options.request, options, ports);
	}
	return (async () => {
		const admitted = await ports.sessionProvisioner.admitSession(runtime, options.input);
		if (options.completion === "admit") {
			void ports.sessionProvisioner
				.runSession(runtime, options.input, admitted, runtime.onHarnessStarted)
				.catch(() => undefined);
			return { mode: "admitted", sessionId: admitted.sessionId };
		}
		const result = await ports.sessionProvisioner.runSession(
			runtime,
			options.input,
			admitted,
			runtime.onHarnessStarted,
		);
		return { mode: "completed", ...result };
	})();
}
