/**
 * The `.fabric/manifest.json` shape — shared by the writer (`context.ts`,
 * bake-time materialisation) and the reader (`writeback-processor.ts`,
 * session-time capture). Before nested-knowledge-items these were two
 * independent structural interfaces, one per file, that happened to look
 * alike: TypeScript never compared them (review.md B5), so the writer never
 * noticed it was missing a field (`scopeKind`) the reader had declared as
 * required and silently defaulted around.
 *
 * One shared type closes that gap for real — if either side's shape drifts,
 * the other file's import breaks at compile time instead of at a 2am
 * writeback.
 */

export interface ManifestEntry {
	version: number;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	source_path: string;
	format: string;
	/**
	 * @lore nested-knowledge-items §5/D4: carried on every entry — directories
	 * included — so a directory's scope is known from the manifest alone, no
	 * `knowledgeItems` read needed before a child inherits it. The writer
	 * (`context.ts`) sets this for every entry it creates, leaf or ancestor
	 * directory; there is no legacy manifest to default around (the manifest
	 * is process-local, written fresh at every bake).
	 */
	scopeKind: string;
}

export interface Manifest {
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	session_id: string;
	// biome-ignore lint/style/useNamingConvention: manifest JSON schema uses snake_case keys
	assembled_at: string;
	items: Record<string, ManifestEntry>;
}
