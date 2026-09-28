/**
 * Minimal Vite ImportMeta extension for the design-system package.
 *
 * Declares only `import.meta.glob` — avoids importing the full `vite/client` lib
 * which conflicts with `"types": ["node"]` in the DS tsconfig.
 *
 * @lore DS tsconfig uses "types":["node"]; this declaration adds only Vite's glob extension, narrowly scoped to avoid conflicts
 */

// Augments the global ImportMeta to include Vite's `glob` transform.
// Using `interface ImportMeta` merges with the @types/node declaration.
interface ImportMeta {
	// Vite's import.meta.glob — typed for the two forms used in DS test files.
	glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>;
	glob<T = unknown>(pattern: string, options?: { eager?: false }): Record<string, () => Promise<T>>;
}
