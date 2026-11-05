import { RUN_CONTEXT_HEADER, type RunContext } from "@hyperidle/domain-model/http";

/** Where the door's requests go: the server in this process, or one across the network. */
export type CoreFetch = (req: Request) => Promise<Response>;

/** Thrown when the door receives an unexpected HTTP status (not 200/422/403). */
export class DoorError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = "DoorError";
		this.status = status;
	}
}

/** What an action answers: its data, or the problems that refused it. */
export type DoorResult<O> =
	| { readonly ok: true; readonly data: O }
	| {
			readonly ok: false;
			readonly problems: readonly { readonly code: string; readonly message: string }[];
	  };

/** The normal action door everyone uses — `POST /api/actions/<name>` — called with one user's key. */
export interface CoreDoor {
	call<O>(key: string, action: string, input: unknown, run?: RunContext): Promise<DoorResult<O>>;
}

/**
 * `baseUrl` ends at the API root (`…/api`). A refusal is an answer; anything else that is not one
 * (a bad key, a server error) throws, so the caller tries again later.
 */
export function createCoreDoor(fetchCore: CoreFetch, baseUrl: string): CoreDoor {
	return {
		async call<O>(key: string, action: string, input: unknown, run?: RunContext) {
			const headers = new Headers({ "content-type": "application/json", "X-API-Key": key });
			if (run) headers.set(RUN_CONTEXT_HEADER, JSON.stringify(run));
			const res = await fetchCore(
				new Request(`${baseUrl}/actions/${action}`, {
					method: "POST",
					headers,
					body: JSON.stringify(input ?? {}),
				}),
			);
			if (res.status === 200 || res.status === 422 || res.status === 403) {
				return (await res.json()) as DoorResult<O>;
			}
			throw new DoorError(`${action} failed (${res.status}): ${await res.text()}`, res.status);
		},
	};
}
