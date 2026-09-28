/**
 * AJ3 — the isolation harness (shared mock providers).
 *
 * The thinnest shim that lets a page-level / data-fed / context-consuming
 * design surface mount in the viewer and in jsdom tests with NO server,
 * database, real routing, or real data. It consolidates the ad-hoc
 * `MemoryRouter`/context wrappers duplicated across ~12 web stories
 * (`PageWrapper` in WorkBetCreate.stories.tsx, `wrap()` in
 * AgentProfile.stories.tsx, and 10 more) into one documented module.
 *
 * Exactly two providers cover the two real isolation hazards:
 *  - react-router hooks (useNavigate / useParams / <Link>) → MemoryRouter.
 *  - AssistantContext consumers → a Provider seeded from the context's own
 *    stable default (the exact { overlayOpen: false, attachContext: noop }
 *    default declared in AssistantContext.tsx).
 *
 *
 * A surface needing a route param wraps its children in
 * `<Routes><Route path=… element=… /></Routes>` itself — MockProviders
 * provides the router, the story provides its own route match when needed.
 */

import type { JSX, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AssistantContext, type AssistantContextValue } from "../contexts/AssistantContext";

export interface MockProvidersProps {
	children: ReactNode;
	/** Initial router entry; defaults to "/". Lets a story mount at a route. */
	route?: string;
	/** Override the assistant context; merged over the stable no-op default. */
	assistant?: Partial<AssistantContextValue>;
}

/** Mirrors the stable default declared in AssistantContext.tsx. */
const DEFAULT_ASSISTANT: AssistantContextValue = {
	overlayOpen: false,
	attachContext: () => undefined,
};

export function MockProviders({
	children,
	route = "/",
	assistant,
}: MockProvidersProps): JSX.Element {
	return (
		<MemoryRouter initialEntries={[route]}>
			<AssistantContext.Provider value={{ ...DEFAULT_ASSISTANT, ...assistant }}>
				{children}
			</AssistantContext.Provider>
		</MemoryRouter>
	);
}
