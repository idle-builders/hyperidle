/**
 * Native module ABI compatibility check.
 *
 * @lore PGlite migration: PGlite is pure WASM — no native modules to check.
 * This script is a no-op now. Kept as a placeholder so the dev script
 * (`check-native.ts && electron .`) doesn't break.
 */

process.stdout.write("[check-native] No native modules to check (PGlite is pure WASM).\n");
