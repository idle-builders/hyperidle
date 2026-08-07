import type { HyperIdleDb } from "@hyperidle/db";
import { AdapterPool, createHarnessAdapter } from "@hyperidle/harness-registry";
import { create, recordConflict, update } from "@hyperidle/knowledge";
import type { RuntimePorts } from "@hyperidle/run-orchestration";
import type { EventBus, WorkerRegisterMessage } from "@hyperidle/shared";
import {
	type ProvisionSessionDeps,
	runtimeDeps,
	startRuntime,
} from "../services/run-orchestration-composition.js";

/** Starts the public runtime with inert peripheral adapters and an injectable execution edge. */
export function startTestRuntime(
	db: HyperIdleDb,
	eventBus: EventBus,
	runtime: ProvisionSessionDeps,
	sessionProvisioner: NonNullable<RuntimePorts["sessionProvisioner"]>,
) {
	const base = runtimeDeps(db, eventBus);
	if (!base.ports) throw new Error("runtimeDeps did not provide production ports");
	const workerPool = new AdapterPool();
	return startRuntime(
		runtimeDeps(db, eventBus, {
			runtime,
			ports: { ...base.ports, sessionProvisioner },
			composition: {
				...base.composition,
				writeback: {
					db,
					knowledge: {
						create,
						async update(db2, id, patch, expectedVersion) {
							return { ok: true, item: await update(db2, id, patch, expectedVersion) };
						},
						recordConflict,
					},
				},
				worker: {
					pool: workerPool,
					adapterFactory: {
						create: (ws, registration) => {
							const message: WorkerRegisterMessage = {
								type: "register",
								id: registration.id,
								name: String(registration.name),
								modelProviders: Array.isArray(registration.modelProviders)
									? registration.modelProviders.map(String)
									: [],
								maxConcurrent: Number(registration.maxConcurrent),
							};
							return createHarnessAdapter({ kind: "remote", ws, registration: message });
						},
					},
				},
			},
		}),
	);
}
