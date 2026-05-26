/**
 * Q3 — BetCreateDialog stories.
 * Renders key states at /designsystem for visual verification.
 */

import type { JSX } from "react";
import { BetCreateDialog } from "./BetCreateDialog";

const MOCK_PRODUCTS = [
	{ id: "prod-1", name: "HyperIdle Core" },
	{ id: "prod-2", name: "Knowledge Fabric" },
	{ id: "prod-3", name: "Analytics Engine" },
];

const noop = (): void => {};

export default { title: "Page: Work/BetCreateDialog" };

/** Dialog open with products loaded. */
export const Open = (): JSX.Element => (
	<BetCreateDialog open={true} onClose={noop} onCreated={noop} products={MOCK_PRODUCTS} />
);

/** Dialog open with no products (empty state). */
export const NoProducts = (): JSX.Element => (
	<BetCreateDialog open={true} onClose={noop} onCreated={noop} products={[]} />
);

/** Dialog closed. */
export const Closed = (): JSX.Element => (
	<BetCreateDialog open={false} onClose={noop} onCreated={noop} products={MOCK_PRODUCTS} />
);
