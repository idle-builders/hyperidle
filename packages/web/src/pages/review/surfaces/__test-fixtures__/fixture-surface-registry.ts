/**
 * AL5 TDZ-GUARD FIXTURE — simulates surface-registry.ts cold load with entries.
 *
 * This fixture is used by AL5-tzdguard-import-chain.test.ts to prove that:
 * 1. The generated-index → register.ts → surface-registry-api.ts import chain
 *    correctly registers surfaces into the real REGISTRY Map.
 * 2. The import chain does not crash with a TDZ ReferenceError.
 *
 * Import order matters:
 *   1. Import surface-registry.ts (initializes REGISTRY with first-party surfaces)
 *   2. Import generated-index-fixture.ts (simulates entries in surface-registry.generated.ts)
 *      → triggers register.ts side effect → registerSurface("al5-tzdguard-fixture", ...)
 *   3. Import REGISTRY from surface-registry-api.ts (the shared Map, now updated)
 *
 * @lore AL5 TDZ-GUARD: If register.ts imported from surface-registry.ts (not api),
 * AND this fixture was the entry point with surface-registry.ts not yet cached,
 * the circular chain would crash. We verify the import succeeds and the surface registers.
 */

// Step 1: initialize the real surface registry (first-party surfaces seeded).
import "../surface-registry.js";

// Step 2: import the fixture generated-index to simulate installed surfaces.
// This triggers: generated-index-fixture.ts → register.ts → surface-registry-api.ts
// → registerSurface("al5-tzdguard-fixture", ...) side effect.
import "./generated-index-fixture.js";

// Step 3: read REGISTRY from the api module (the live Map, updated by step 2).
import { REGISTRY } from "../surface-registry-api.js";

export { REGISTRY };
export const FIXTURE_REGISTRY_LOADED = true;
