/**
 * AL5 TDZ-GUARD FIXTURE — simulated surface-registry.generated.ts.
 *
 * Mimics what surface-registry.generated.ts looks like after `surface:add`
 * appends an installed surface:
 *
 *   import "./al5-tzdguard-surface/register.js";
 *
 * The real surface-registry.ts imports surface-registry.generated.ts.
 * For the test, surface-registry.ts instead imports surface-registry.generated.ts
 * (the real empty one). The test imports this fixture directly to simulate
 * what happens when surface-registry.generated.ts has entries.
 *
 * @lore AL5 TDZ-GUARD TEST: The test (AL5-tzdguard-import-chain.test.tsx)
 * imports surface-registry.ts first (which initializes REGISTRY), then imports
 * this fixture (which triggers registerSurface via the fixture register.ts).
 * This proves the generated-index import chain works without TDZ crash.
 */

import "./al5-tzdguard-surface/register.js";
