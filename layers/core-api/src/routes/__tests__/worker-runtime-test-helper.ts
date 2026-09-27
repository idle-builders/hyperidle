import { EventBus } from "@hyperidle/event-bus";
import { type AdapterPool, RemoteHarnessAdapter, type WsLike } from "@hyperidle/harness-registry";
import { type RuntimeDeps, type RuntimeHandle, startRuntime } from "@hyperidle/run-orchestration";

/** Exercise worker ingress only through the owned public runtime handle. */
export async function startWorkerTestRuntime(pool: AdapterPool): Promise<RuntimeHandle> {
	const eventBus = new EventBus();
	const deps = {
		db: {} as never,
		eventBus,
		ports: {
			sessionRequests: {
				listSessionRequests: async () => [],
				reapExpired: async () => ({ intents: 0 }),
				drainIntents: async () => undefined,
			},
			sessionLifecycle: {
				recoverRequestedTerminations: async () => 0,
			},
		} as never,
		durableQueue: {} as never,
		composition: {
			context: {} as never,
			provisioner: {} as never,
			writeback: { db: {} as never, document: {} as never },
			worker: {
				pool,
				adapterFactory: {
					create: (ws: unknown, registration: { readonly id: string }) => {
						const source = ws as {
							send(data: string): void;
							close?(): void;
							onmessage?: ((evt: { data: string }) => void) | null;
							onclose?: (() => void) | null;
							onerror?: ((err: Error) => void) | null;
						};
						const wsLike: WsLike = {
							send: (data: string) => source.send(data),
							close: () => source.close?.(),
							onmessage: source.onmessage ?? null,
							onclose: source.onclose ?? null,
							onerror: source.onerror ?? null,
						};
						return new RemoteHarnessAdapter(wsLike, {
							type: "register",
							id: registration.id,
							name: registration.id,
							modelProviders: [],
							maxConcurrent: 1,
						});
					},
				},
			},
		},
	} as RuntimeDeps;
	return startRuntime(deps);
}

export interface WorkerSocketHandlers {
	onMessage(event: { data: unknown }, ws: unknown): void;
	onClose(): void;
}

export class WorkerTestApp {
	public middleware: ((context: never, next: () => Promise<void>) => Promise<unknown>) | null =
		null;
	public handlers: WorkerSocketHandlers | null = null;
	use(_path: string, handler: never): void {
		this.middleware = handler;
	}
	get(_path: string, handler: unknown): void {
		void handler;
	}
}

export function registerWorkerTestSocket(
	runtime: RuntimeHandle,
	app = new WorkerTestApp(),
): WorkerTestApp {
	runtime.registerWorkerWebSocket(
		app as never,
		((factory: () => WorkerSocketHandlers) => {
			app.handlers = factory();
			return {};
		}) as never,
	);
	return app;
}
