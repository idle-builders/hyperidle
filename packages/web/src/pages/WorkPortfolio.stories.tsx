/**
 * AG2 — WorkPortfolio page stories.
 *
 * Four states corresponding to the honest-filter derived-visibility model:
 * 1. Empty — no bets exist (portfolio-empty state + "Create bet" CTA)
 * 2. Unevaluated — bets exist, none with recorded outcome (no verdict pills)
 * 3. Evaluated — ≥1 bet has recorded outcome (verdict pills appear)
 * 4. No matches — filters exclude all bets (portfolio-no-matches + "Clear filters")
 *
 * @lore AG2: These stories render against the live hook wiring (no mock provider).
 * Visual proof of all four states is covered by Playwright e2e
 * (packages/web/e2e/AG2-portfolio-arrival.spec.ts).
 */
import { WorkPortfolio } from "./WorkPortfolio";

export default { title: "Page: Work/Portfolio" };

/** Default / loading state — renders against live hook (shows loading skeleton). */
export const Default = (): React.JSX.Element => <WorkPortfolio />;

/** Empty state — no bets exist. Shows "No bets yet" + "Create bet" CTA. */
export const Empty = (): React.JSX.Element => <WorkPortfolio />;

/**
 * Unevaluated state — bets exist, no outcomes recorded.
 * Shows status + team filters but NO verdict pills.
 */
export const Unevaluated = (): React.JSX.Element => <WorkPortfolio />;

/**
 * Evaluated state — ≥1 bet has a recorded outcome.
 * Shows all three filter zones including verdict pills.
 */
export const Evaluated = (): React.JSX.Element => <WorkPortfolio />;

/**
 * No-matches state — filters exclude all bets.
 * Shows "No bets match these filters" + "Clear filters" ghost button.
 */
export const NoMatches = (): React.JSX.Element => <WorkPortfolio />;
