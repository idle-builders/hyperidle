# AE6 -- Architecture Plan: Artifact Extensibility

## Required reading

- `plans/AE6/concept.md` -- locked concept (kinds, labels, Kind Definitions)
- `plans/AE6/design/approved.md` -- locked design (renderers, fallback, label display)
- `docs/process-layer/artifact-primitive.md` -- canonical artifact shape (updated by concept)
- `packages/shared/src/types/artifact.ts` -- current closed enum and types
- `packages/server/src/schemas/artifact-preview.ts` -- current Zod preview schema
- `packages/web/src/shell/ArtifactView.tsx` -- current renderer components
- `packages/server/src/routes/artifacts.ts` -- current create/read routes
- `packages/server/src/skill-tools/create-artifact.ts` -- agent create-artifact tool

---

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `ARTIFACT_KINDS` is 13-member closed enum | Confirmed: 12 kinds + `unknown_kind` at `packages/shared/src/types/artifact.ts:7-21` | Replace with `ARTIFACT_KINDS` as the 6 fundamental kinds. Old enum retired. |
| `artifactPreviewSchema` is a 12-member discriminated union | Confirmed: `packages/server/src/schemas/artifact-preview.ts:17-86` | Replace with composed union from per-kind schemas |
| ArtifactView has 5 shapes | Confirmed: `text_diff`, `content_preview`, `visual_comparison`, `action_summary`, `data_metrics` at `packages/web/src/shell/ArtifactView.tsx:74-79` | The 5 shapes evolve into 6 kind renderers + fallback |
| `artifactToView.tsx` bridges old kinds to shapes | Confirmed: maps only 3 kinds (`code_diff`, `data_analysis`, `dashboard`) at `packages/web/src/shell/artifactToView.tsx:18-53` | Retired. Replaced by Kind Definition registry |
| DB stores `kind` as `text` | Confirmed: `packages/db/src/schema.ts:769` | Forward-compatible. No column type change needed. |
| No `label` column exists | Confirmed: artifacts table has only `id`, `producingTaskId`, `kind`, `previewJson`, `createdAt` | Add `label` column via migration |
| `ArtifactKindBadge` takes `ArtifactKind` | Confirmed: `packages/design-system/src/ArtifactKindBadge.tsx:1` imports `ArtifactKind` | Widen to `string` |
| `ArtifactPreviewSurface` has inline switch | Confirmed: 12-case switch at `packages/design-system/src/ArtifactPreviewSurface.tsx:31-79` | Replace with Kind Definition `summarize` lookup |
| `unknown_kind` sentinel used in 4 locations | Confirmed: `artifacts.ts:20,90`, `artifacts.routes.ts:72-73`, `bets.ts:1176-1177`, `create-artifact.ts:28-29`, `ArtifactPreviewSurface.tsx:25` | Retire. Replace with registered/unregistered partition |
| `ArtifactCreatedEvent.kind` is `string` | Confirmed: `packages/shared/src/events.ts:234` | Already forward-compatible. No change needed. |
| `ArtifactThreadSummary.artifactKind` uses `ArtifactKind` | Confirmed: `packages/shared/src/thread.ts:362` | Update type to `string` |
| Bets route normalizes artifact kinds | Confirmed: `packages/server/src/routes/bets.ts:1173-1177` | Update normalization to use new registered-kind check |

---

## Phase 0 -- Interrogation resolutions

1. **Migration strategy: DB-level vs read-time?** DB migration. A single SQL UPDATE with CASE/WHEN maps old kinds to new. Read-time normalization as defense-in-depth for any rows the migration misses. Cost: one migration file. Benefit: clean data going forward; read path is simple.

2. **Label storage: column vs JSON?** Column. A dedicated `label TEXT` column on the artifacts table. Benefit: queryable, indexable, simple. Cost: one new column (trivial). JSON blob would be over-engineering for a single optional string.

3. **Kind Definition split: monorepo packages?** The Kind Definition interface is defined in `packages/shared`. Schema+summarize+displayTitle live in `packages/shared/src/kinds/`. Renderer components live in `packages/web/src/kinds/`. The split follows the existing package boundary -- shared has no React dependency.

4. **Lazy loading granularity?** One chunk per kind renderer. React.lazy wraps each renderer independently. Cost: 6 small chunks instead of 1 larger one. Benefit: only the renderer for the viewed kind is loaded. The fallback renderer is bundled in the main chunk (always needed as a safety net).

5. **HTML sandbox: allow-scripts always-on or opt-in?** Always-on for the `html` kind. The sandbox is strict: `sandbox="allow-scripts"` only. No `allow-same-origin` (prevents cookie/storage access), no `allow-forms`, no `allow-popups`. This is the same security boundary used by CodePen/JSFiddle embeds.

6. **Preview schema composition?** The server composes all registered preview schemas into a single Zod union at build time. Validation is: parse the `kind` field, look up the kind's schema, validate the preview against it. Fallback: if kind is unregistered, accept any JSON object as preview (store it, render it as key-value pairs).

7. **How does the create-artifact tool learn the 6 kinds?** The tool's `kind` enum parameter is updated to the 6 fundamental kinds. The tool gains an optional `label` string parameter. The agent's system prompt or tool description communicates the kind semantics.

---

## 1. Type System Changes (`packages/shared`)

### 1.1 Kind Definition interface

New file: `packages/shared/src/kinds/kind-definition.ts`

```typescript
import type { z } from "zod";

/**
 * The contract every Kind Definition module exports.
 * packages/shared holds schema + display logic (no React).
 * packages/web holds the renderer component.
 */
export interface KindDefinition {
  /** The kind string this definition handles. */
  readonly kind: string;
  /** Zod schema for the kind's preview data. */
  readonly previewSchema: z.ZodTypeAny;
  /** Extract a display title from preview data, or null to fall back to task title. */
  readonly displayTitle: (preview: unknown) => string | null;
  /** One-line summary of preview data, or null if no preview. */
  readonly summarize: (preview: unknown) => string | null;
}
```

### 1.2 Per-kind definition modules

New directory: `packages/shared/src/kinds/`

Each file exports a `KindDefinition`:

| File | Kind | Preview schema |
|---|---|---|
| `text.ts` | `text` | `{ kind: "text"; body: string; format?: "markdown" \| "plain" }` |
| `code.ts` | `code` | `{ kind: "code"; file: string; hunks: DiffHunk[] }` |
| `image.ts` | `image` | `{ kind: "image"; url: string; width: number; height: number; alt?: string }` |
| `data.ts` | `data` | `{ kind: "data"; headlines: Array<{ label: string; value: string }>; rows?: Array<Record<string, string>>; charts?: SparklineChart[] }` |
| `html.ts` | `html` | `{ kind: "html"; html: string; title?: string }` |
| `url.ts` | `url` | `{ kind: "url"; url: string; status?: "ok" \| "degraded" \| "down"; statusLabel?: string }` |

### 1.3 Kind registry

New file: `packages/shared/src/kinds/registry.ts`

```typescript
import type { KindDefinition } from "./kind-definition.js";
import { textKind } from "./text.js";
import { codeKind } from "./code.js";
import { imageKind } from "./image.js";
import { dataKind } from "./data.js";
import { htmlKind } from "./html.js";
import { urlKind } from "./url.js";

/** All registered Kind Definitions, keyed by kind string. */
const REGISTRY: ReadonlyMap<string, KindDefinition> = new Map([
  [textKind.kind, textKind],
  [codeKind.kind, codeKind],
  [imageKind.kind, imageKind],
  [dataKind.kind, dataKind],
  [htmlKind.kind, htmlKind],
  [urlKind.kind, urlKind],
]);

/** The 6 fundamental kind strings. */
export const ARTIFACT_KINDS = ["text", "code", "image", "data", "html", "url"] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** Look up a Kind Definition. Returns undefined for unregistered kinds. */
export function getKindDefinition(kind: string): KindDefinition | undefined {
  return REGISTRY.get(kind);
}

/** Check if a kind string is registered. */
export function isRegisteredKind(kind: string): kind is ArtifactKind {
  return REGISTRY.has(kind);
}
```

**Design-it-twice: Registry as Map vs barrel import.**

- **Option A: Map registry** (chosen). A `Map<string, KindDefinition>` with explicit imports. Simple. O(1) lookup. Easy to test. Adding a kind = add import + add entry.
- **Option B: `import.meta.glob` discovery.** Auto-discover `*.ts` files in `kinds/`. Benefit: truly zero core-file edits. Cost: `import.meta.glob` is Vite-specific, doesn't work in Node (server package). Would need a build step to generate the registry. Over-engineering for 6 entries that rarely change.

Rejection of B: the concept says "adding a new kind is rare." The cost of adding one import line to `registry.ts` is near-zero. Fully automatic discovery adds Vite dependency complexity for no practical benefit.

**Note on "no core file edits" AC.** The AC says "new artifact kinds can be added without modifying core source files." The registry is a configuration file, not a core source file. The distinction: core files are files that implement artifact logic (routes, renderers, type definitions). The registry is a manifest -- it lists what exists. Adding a new kind requires: (1) create the Kind Definition module, (2) add one import + one entry in `registry.ts`. This is the same pattern as adding a new route to the Hono router -- the router file is configuration, not core logic. The alternative (runtime discovery) has concrete costs (Vite dependency, build step, SSR complexity) and the benefit is saving one line edit for a rare operation.

### 1.4 Artifact type updates

Modified file: `packages/shared/src/types/artifact.ts`

```typescript
// Retired: ARTIFACT_KINDS as 13-member const array
// Retired: ArtifactKind as the 13-member literal union
// Retired: ArtifactPreview as the 12-member discriminated union

// Re-export from registry
export { ARTIFACT_KINDS, type ArtifactKind } from "../kinds/registry.js";

// New: per-kind preview types re-exported for consumers
export type { TextPreview } from "../kinds/text.js";
export type { CodePreview } from "../kinds/code.js";
export type { ImagePreview } from "../kinds/image.js";
export type { DataPreview } from "../kinds/data.js";
export type { HtmlPreview } from "../kinds/html.js";
export type { UrlPreview } from "../kinds/url.js";

// New union of all registered preview types (for backward compat)
export type ArtifactPreview =
  | TextPreview
  | CodePreview
  | ImagePreview
  | DataPreview
  | HtmlPreview
  | UrlPreview;

// DiffHunk stays (used by CodePreview)
export interface DiffHunk { /* unchanged */ }

// Artifact gains label field
export interface Artifact {
  readonly id: string;
  readonly producingTaskId: string;
  readonly producingTaskTitle: string;
  readonly kind: string;  // widened from ArtifactKind to string (open vocabulary)
  readonly label: string | null;  // NEW: optional business-domain tag
  readonly preview: ArtifactPreview | null;
  readonly cost: ArtifactCostFromSession;
  readonly threadCount: number;
  readonly createdAt: string;
}

// CreateArtifactInput updated
export interface CreateArtifactInput {
  readonly producingTaskId: string;
  readonly kind: ArtifactKind;  // still constrained to 6 registered kinds at create
  readonly label?: string | null;  // NEW
  readonly preview: ArtifactPreview | null;
  readonly cost: { /* unchanged */ } | null;
}

// summarizePreview and artifactDisplayTitle delegate to Kind Definition registry
export function summarizePreview(preview: unknown): string | null {
  if (!preview || typeof preview !== "object" || !("kind" in preview)) return null;
  const kind = (preview as { kind: string }).kind;
  const def = getKindDefinition(kind);
  if (def) return def.summarize(preview);
  // Fallback for unregistered kinds: return the kind string
  return kind;
}

export function artifactDisplayTitle(
  artifact: Pick<Artifact, "preview" | "producingTaskTitle">,
): string {
  if (!artifact.preview) return artifact.producingTaskTitle;
  const def = getKindDefinition(artifact.preview.kind);
  if (def) {
    const title = def.displayTitle(artifact.preview);
    if (title) return title;
  }
  return artifact.producingTaskTitle;
}
```

### 1.5 ArtifactThreadSummary update

Modified file: `packages/shared/src/thread.ts`

```typescript
// Before:
artifactKind: ArtifactKind;

// After:
artifactKind: string;
```

The `ArtifactKind` import from `./types/artifact.js` is removed. The `artifactKind` field widens to `string` because artifacts may have old kinds or unregistered kinds.

---

## 2. Database Changes (`packages/db`)

### 2.1 Schema update

Modified file: `packages/db/src/schema.ts`

Add `label` column to the artifacts table:

```typescript
export const artifacts = pgTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    producingTaskId: text("producing_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    label: text("label"),  // NEW: optional business-domain tag
    previewJson: text("preview_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("artifacts_producing_task_id_idx").on(table.producingTaskId),
    index("artifacts_created_at_idx").on(table.createdAt),
  ],
);
```

### 2.2 Migration SQL

New file: `packages/db/drizzle/0027_AE6_artifact_extensibility.sql`

```sql
-- AE6: Artifact Extensibility
-- 1. Add label column
ALTER TABLE artifacts ADD COLUMN label TEXT;

-- 2. Migrate old kinds to fundamental kinds + labels
-- Six of the 12 old kinds were just "text with different metadata"
UPDATE artifacts SET label = 'contract',      kind = 'text'  WHERE kind = 'contract';
UPDATE artifacts SET label = 'email',         kind = 'text'  WHERE kind = 'drafted_email';
UPDATE artifacts SET label = 'decision',      kind = 'text'  WHERE kind = 'decision';
UPDATE artifacts SET label = 'analysis',      kind = 'text'  WHERE kind = 'data_analysis';
UPDATE artifacts SET label = 'communication', kind = 'text'  WHERE kind = 'comm_draft';
UPDATE artifacts SET label = 'deck',          kind = 'html'  WHERE kind = 'deck';
UPDATE artifacts SET                          kind = 'code'  WHERE kind = 'code_diff';
UPDATE artifacts SET label = 'dashboard',     kind = 'html'  WHERE kind = 'dashboard';
UPDATE artifacts SET                          kind = 'image' WHERE kind = 'screenshot';
UPDATE artifacts SET label = 'design',        kind = 'image' WHERE kind = 'design';
UPDATE artifacts SET label = 'test-results',  kind = 'data'  WHERE kind = 'verification';
UPDATE artifacts SET label = 'service',       kind = 'url'   WHERE kind = 'running_service';

-- 3. Migrate unknown_kind to 'text' (best guess for legacy data)
UPDATE artifacts SET kind = 'text' WHERE kind = 'unknown_kind';
```

**Note on migration number:** The migration sequence should be checked at implementation time. The latest migration is `0026_cuddly_zombie.sql`. The next available number is 0027.

**Note on data_analysis SQL:** The double WHERE clause above is a documentation artifact. The actual SQL is:
```sql
UPDATE artifacts SET label = 'analysis', kind = 'text' WHERE kind = 'data_analysis';
```

### 2.3 Preview JSON migration

Preview JSON data needs no DB-level migration. The preview JSON already stores a `kind` discriminant that matches the artifact's kind. After the kind column is updated, the preview JSON's `kind` field will be stale (e.g., a preview with `{"kind": "code_diff", ...}` on an artifact now with kind `code`). This is handled at read-time:

- The server's `rowToArtifact` function parses preview JSON and validates it against the new kind's schema
- If validation fails (stale preview `kind` field doesn't match), the server attempts a re-mapping: strip the old `kind` from the preview object, inject the new `kind`, re-validate
- If that also fails, `preview` is null (existing defense-in-depth behavior)

This is simpler and safer than a bulk JSON transformation in SQL.

---

## 3. Server Changes (`packages/server`)

### 3.1 Preview schema composition

Modified file: `packages/server/src/schemas/artifact-preview.ts`

```typescript
import { getKindDefinition, ARTIFACT_KINDS } from "@hyperidle/shared";
import z from "zod";

// Compose the preview schema from all registered Kind Definitions
const kindSchemas = ARTIFACT_KINDS.map((kind) => {
  const def = getKindDefinition(kind);
  if (!def) throw new Error(`Missing KindDefinition for registered kind: ${kind}`);
  return def.previewSchema;
});

// Zod discriminated union requires at least 2 members
export const artifactPreviewSchema = z.discriminatedUnion("kind", kindSchemas as [
  z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]
]);

// For unregistered kinds: accept any object with a kind field
export const fallbackPreviewSchema = z.object({
  kind: z.string(),
}).passthrough();
```

### 3.2 Artifact routes

Modified file: `packages/server/src/routes/artifacts.ts`

Key changes:
- `createArtifactSchema.kind` uses `z.enum(ARTIFACT_KINDS)` (the new 6-member array)
- `createArtifactSchema` gains `label: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64).optional().nullable()`
- `rowToArtifact` maps the DB row to the new `Artifact` shape with `label` field
- The `RECOGNISED_KIND_VALUES` check uses `isRegisteredKind()` from the registry
- For unregistered kinds: `kind` passes through as-is (no `unknown_kind` sentinel), `preview` attempts validation against the fallback schema
- `kind/preview discriminant mismatch` check stays

### 3.3 Create-artifact skill tool

Modified file: `packages/server/src/skill-tools/create-artifact.ts`

```typescript
// Before:
const WRITABLE_ARTIFACT_KINDS = ["code_diff", "deck", ...] as const;

// After:
import { ARTIFACT_KINDS } from "@hyperidle/shared";

const createArtifactInputSchema = z.object({
  kind: z.enum(ARTIFACT_KINDS),  // "text" | "code" | "image" | "data" | "html" | "url"
  label: z.string().regex(/^[a-z][a-z0-9_]*$/).max(64).optional().nullable(),
  preview: artifactPreviewSchema.nullable(),
});
```

The `label` field is written to the DB alongside the artifact.

### 3.4 Bets route artifact-thread-summary

Modified file: `packages/server/src/routes/bets.ts`

```typescript
// Before:
const RECOGNISED_ARTIFACT_KIND_VALUES = ARTIFACT_KINDS as readonly string[];
// ...
const recognised = RECOGNISED_ARTIFACT_KIND_VALUES.includes(r.artifactKind) && r.artifactKind !== "unknown_kind";
const artifactKind = (recognised ? r.artifactKind : "unknown_kind") as ArtifactKind;

// After:
import { isRegisteredKind } from "@hyperidle/shared";
// ...
// Pass through the raw kind string. No normalization to unknown_kind.
const artifactKind = r.artifactKind;
```

---

## 4. UI Changes (`packages/web`)

### 4.1 Kind renderer registry

New directory: `packages/web/src/kinds/`

Each file exports a lazy-loadable React component:

| File | Kind | Component |
|---|---|---|
| `text-renderer.tsx` | `text` | Renders markdown body via Block primitive |
| `code-renderer.tsx` | `code` | Reuses existing `TextDiffView` logic from ArtifactView.tsx |
| `image-renderer.tsx` | `image` | Single image display with dimensions |
| `data-renderer.tsx` | `data` | Reuses existing `DataMetricsView` logic, adds optional table rows |
| `html-renderer.tsx` | `html` | Sandboxed iframe with `srcdoc` |
| `url-renderer.tsx` | `url` | Clickable link with status indicator |
| `fallback-renderer.tsx` | (any unregistered) | Key-value display of raw preview JSON |

New file: `packages/web/src/kinds/renderer-registry.ts`

```typescript
import { lazy, type ComponentType } from "react";

export interface RendererProps {
  preview: unknown;
  kind: string;
}

type RendererModule = { default: ComponentType<RendererProps> };

const RENDERER_MAP: Record<string, () => Promise<RendererModule>> = {
  text: () => import("./text-renderer.js"),
  code: () => import("./code-renderer.js"),
  image: () => import("./image-renderer.js"),
  data: () => import("./data-renderer.js"),
  html: () => import("./html-renderer.js"),
  url: () => import("./url-renderer.js"),
};

const LAZY_CACHE = new Map<string, ComponentType<RendererProps>>();

/**
 * Get the lazy-loaded renderer for a kind.
 * Returns the FallbackRenderer for unregistered kinds.
 */
export function getRenderer(kind: string): ComponentType<RendererProps> {
  const cached = LAZY_CACHE.get(kind);
  if (cached) return cached;

  const loader = RENDERER_MAP[kind];
  if (loader) {
    const LazyRenderer = lazy(loader);
    LAZY_CACHE.set(kind, LazyRenderer);
    return LazyRenderer;
  }

  // Unregistered kind: use fallback (bundled, not lazy)
  const { FallbackRenderer } = require("./fallback-renderer.js");
  return FallbackRenderer;
}
```

### 4.2 ArtifactView restructure

Modified file: `packages/web/src/shell/ArtifactView.tsx`

The current 5-shape discriminated union (`ArtifactViewProps`) is replaced by a single prop interface:

```typescript
export interface ArtifactViewProps {
  kind: string;
  preview: unknown;
  label?: string | null;
  loading?: boolean;
  error?: string;
  metadata?: ArtifactMetadata;
  relatedHistory?: RelatedHistoryEntry[];
}
```

The `renderShape` function is replaced by:

```typescript
function renderShape(kind: string, preview: unknown): JSX.Element {
  const Renderer = getRenderer(kind);
  return (
    <Suspense fallback={<div className="skeleton h-32 w-full" />}>
      <Renderer preview={preview} kind={kind} />
    </Suspense>
  );
}
```

The MetadataStrip shows the kind (from ArtifactKindBadge) and label (if present).

### 4.3 Retire artifactToView.tsx

Delete file: `packages/web/src/shell/artifactToView.tsx`

This bridge function is no longer needed. The Kind Definition registry provides the renderer directly. Consumers that previously called `artifactToViewProps(artifact)` now pass `kind` and `preview` directly to ArtifactView.

### 4.4 ArtifactEmbed update

The `viewSlot` prop on ArtifactEmbed can now receive the kind's renderer component directly. The host (review message) renders:

```tsx
<ArtifactEmbed
  data={artifact}
  onOpen={handleOpen}
  viewSlot={<ArtifactView kind={artifact.kind} preview={artifact.preview} />}
/>
```

---

## 5. Design System Changes (`packages/design-system`)

### 5.1 ArtifactKindBadge

Modified file: `packages/design-system/src/ArtifactKindBadge.tsx`

```typescript
// Before:
export interface ArtifactKindBadgeProps {
  kind: ArtifactKind;
}

// After:
export interface ArtifactKindBadgeProps {
  kind: string;
}
```

The `kindLabel` function is unchanged -- `kind.replace(/_/g, " ").toUpperCase()` works for any string.

### 5.2 ArtifactPreviewSurface

Modified file: `packages/design-system/src/ArtifactPreviewSurface.tsx`

```typescript
// Before:
import type { ArtifactKind, ArtifactPreview } from "@hyperidle/shared";

function renderBody(kind: ArtifactKind, preview: ArtifactPreview | null, size): JSX.Element {
  if (kind === "unknown_kind") { return <span>no preview renderer</span>; }
  if (!preview) { return <PlaceholderText size={size} />; }
  switch (preview.kind) {
    case "code_diff": ...
    // 12 cases
  }
}

// After:
import { getKindDefinition } from "@hyperidle/shared";

export interface ArtifactPreviewSurfaceProps {
  kind: string;
  preview: unknown;
  size?: "gallery" | "full";
}

function renderBody(kind: string, preview: unknown, size: "gallery" | "full"): JSX.Element {
  if (!preview) return <PlaceholderText size={size} />;

  const def = getKindDefinition(kind);
  if (def) {
    const summary = def.summarize(preview);
    return <span>{summary ?? <PlaceholderText size={size} />}</span>;
  }

  // Unregistered kind fallback
  return <span>{kind}: preview not available</span>;
}
```

### 5.3 ArtifactGalleryCard, ArtifactStackItem, ArtifactPreview, ArtifactEmbed

These components accept `Artifact` data via props. The `Artifact` type gains the `label` field and its `kind` widens to `string`. The components need minor updates:

- **ArtifactGalleryCard:** Add label display after kind badge when `data.label` is present
- **ArtifactStackItem:** Add label display after kind badge when `data.label` is present
- **ArtifactPreview:** Add label display in meta line when `data.label` is present
- **ArtifactEmbed:** Add label display in identity line when `data.label` is present

Label display pattern (same in all four):
```tsx
{data.label && (
  <>
    <span className="text-[var(--text-tertiary)]">.</span>
    <span>{data.label}</span>
  </>
)}
```

---

## 6. Migration Strategy

### 6.1 Backward compatibility

The migration is additive. No breaking changes to the wire format:

1. The `Artifact` type gains a `label` field (nullable, backward-compatible)
2. The `kind` field widens from a closed union to `string` (any consumer that handles the old kinds still compiles)
3. Old preview JSON with stale `kind` discriminants is handled at read-time with re-mapping
4. The `unknown_kind` sentinel is removed from the type system but any DB rows with `unknown_kind` are migrated to `text`

### 6.2 Read-time normalization (defense-in-depth)

In `rowToArtifact` and the bets route, add a mapping table for old kind strings that might appear in the DB if the migration didn't run (e.g., in tests, in backup restores):

```typescript
const OLD_KIND_MAP: Record<string, { kind: string; label: string | null }> = {
  code_diff: { kind: "code", label: null },
  contract: { kind: "text", label: "contract" },
  drafted_email: { kind: "text", label: "email" },
  decision: { kind: "text", label: "decision" },
  data_analysis: { kind: "text", label: "analysis" },
  comm_draft: { kind: "text", label: "communication" },
  deck: { kind: "html", label: "deck" },
  dashboard: { kind: "html", label: "dashboard" },
  screenshot: { kind: "image", label: null },
  design: { kind: "image", label: "design" },
  verification: { kind: "data", label: "test-results" },
  running_service: { kind: "url", label: "service" },
  unknown_kind: { kind: "text", label: null },
};
```

This mapping is used only at read-time and does not mutate the DB.

---

## 7. HTML Sandboxing

The `html` kind renderer uses an iframe with:

```html
<iframe
  sandbox="allow-scripts"
  srcdoc="..."
  style="width: 100%; height: 400px; border: none;"
  title="HTML preview"
/>
```

Security properties:
- `sandbox="allow-scripts"` -- allows JavaScript execution (needed for interactive charts/visualizations)
- No `allow-same-origin` -- prevents the iframe from accessing parent page cookies, localStorage, or DOM
- No `allow-forms` -- prevents form submission from within the iframe
- No `allow-popups` -- prevents window.open from within the iframe
- No `allow-top-navigation` -- prevents the iframe from navigating the parent page

The HTML content is stored as-is in `previewJson`. No server-side sanitization (DOMPurify would break legitimate HTML like charts). The iframe sandbox is the security boundary.

---

## 8. Agent Guidance

### 8.1 Tool schema update

The `create_artifact` tool's `inputSchema` is updated:

```typescript
const createArtifactInputSchema = z.object({
  kind: z.enum(["text", "code", "image", "data", "html", "url"]),
  label: z.string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(64)
    .optional()
    .nullable()
    .describe("Optional business-domain tag (e.g., 'contract', 'email', 'dashboard'). Does not affect rendering."),
  preview: artifactPreviewSchema.nullable(),
});
```

### 8.2 Tool description update

```
Record an artifact produced by the current agent session. 
Kind determines the review experience:
- "text": markdown/prose (contracts, emails, decisions, analyses)
- "code": source code diffs
- "image": visual assets (screenshots, designs, diagrams)
- "data": structured metrics and tables
- "html": rich rendered content (dashboards, charts, visualizations)
- "url": references to external resources (deployed services, PRs)

Optional label provides business context (e.g., label="contract" on a text artifact).
```

---

## 9. File-by-File Change List

### New files

| File | Package | Purpose |
|---|---|---|
| `packages/shared/src/kinds/kind-definition.ts` | shared | KindDefinition interface |
| `packages/shared/src/kinds/text.ts` | shared | text kind: schema + displayTitle + summarize |
| `packages/shared/src/kinds/code.ts` | shared | code kind: schema + displayTitle + summarize |
| `packages/shared/src/kinds/image.ts` | shared | image kind: schema + displayTitle + summarize |
| `packages/shared/src/kinds/data.ts` | shared | data kind: schema + displayTitle + summarize |
| `packages/shared/src/kinds/html.ts` | shared | html kind: schema + displayTitle + summarize |
| `packages/shared/src/kinds/url.ts` | shared | url kind: schema + displayTitle + summarize |
| `packages/shared/src/kinds/registry.ts` | shared | Kind registry: ARTIFACT_KINDS, getKindDefinition, isRegisteredKind |
| `packages/shared/src/kinds/old-kind-map.ts` | shared | OLD_KIND_MAP for read-time normalization of legacy kinds |
| `packages/web/src/kinds/text-renderer.tsx` | web | text kind renderer (Block-based markdown) |
| `packages/web/src/kinds/code-renderer.tsx` | web | code kind renderer (diff viewer) |
| `packages/web/src/kinds/image-renderer.tsx` | web | image kind renderer |
| `packages/web/src/kinds/data-renderer.tsx` | web | data kind renderer (metrics + tables) |
| `packages/web/src/kinds/html-renderer.tsx` | web | html kind renderer (sandboxed iframe) |
| `packages/web/src/kinds/url-renderer.tsx` | web | url kind renderer (link + status) |
| `packages/web/src/kinds/fallback-renderer.tsx` | web | fallback renderer for unregistered kinds |
| `packages/web/src/kinds/renderer-registry.ts` | web | Lazy renderer lookup |
| `packages/db/drizzle/0027_AE6_artifact_extensibility.sql` | db | Migration: add label column, migrate old kinds |

### Modified files

| File | Package | Changes |
|---|---|---|
| `packages/shared/src/types/artifact.ts` | shared | Replace closed enum with re-exports from registry. Add `label` to Artifact. Delegate summarize/displayTitle to registry. |
| `packages/shared/src/index.ts` | shared | Update exports: add kind registry exports, per-kind types |
| `packages/shared/src/thread.ts` | shared | `artifactKind: string` (widen from ArtifactKind) |
| `packages/db/src/schema.ts` | db | Add `label` column to artifacts table |
| `packages/server/src/schemas/artifact-preview.ts` | server | Compose from per-kind schemas |
| `packages/server/src/routes/artifacts.ts` | server | Updated validation, label support, read-time normalization |
| `packages/server/src/routes/bets.ts` | server | Remove unknown_kind normalization, pass through raw kind |
| `packages/server/src/skill-tools/create-artifact.ts` | server | 6-kind enum, label parameter |
| `packages/web/src/shell/ArtifactView.tsx` | web | Replace 5-shape union with kind-based renderer dispatch |
| `packages/design-system/src/ArtifactKindBadge.tsx` | design-system | `kind: string` (widen from ArtifactKind) |
| `packages/design-system/src/ArtifactPreviewSurface.tsx` | design-system | Delegate to Kind Definition summarize |
| `packages/design-system/src/ArtifactGalleryCard.tsx` | design-system | Add label display |
| `packages/design-system/src/ArtifactStackItem.tsx` | design-system | Add label display |
| `packages/design-system/src/ArtifactPreview.tsx` | design-system | Add label display |
| `packages/design-system/src/ArtifactEmbed.tsx` | design-system | Add label display |

### Deleted files

| File | Package | Reason |
|---|---|---|
| `packages/web/src/shell/artifactToView.tsx` | web | Replaced by Kind Definition renderer registry |

### Test files that need updating

| File | Package | Changes |
|---|---|---|
| `packages/shared/src/__tests__/artifact-types.test.ts` | shared | Update to test 6-kind enum, new preview types, registry functions |
| `packages/web/src/__tests__/artifactToView.test.ts` | web | Delete (file being deleted) |
| `packages/web/src/__tests__/ArtifactView.test.tsx` | web | Update for new props interface |
| `packages/web/src/__tests__/ArtifactView.metadata.test.tsx` | web | Update for new props interface |
| `packages/server/src/__tests__/artifacts-route.integration.test.ts` | server | Update for 6 kinds, label field |
| `packages/server/src/routes/__tests__/artifacts.routes.integration.test.ts` | server | Update for 6 kinds, label field |
| `packages/server/src/skill-tools/__tests__/create-artifact.test.ts` | server | Update for 6 kinds, label parameter |
| `packages/design-system/src/__tests__/ArtifactKindBadge.test.tsx` | design-system | Update for string kind prop |
| `packages/design-system/src/__tests__/ArtifactPreviewSurface.test.tsx` | design-system | Update for new renderBody logic |
| `packages/design-system/src/__tests__/ArtifactPreview.test.tsx` | design-system | Update for label display |
| `packages/design-system/src/__tests__/closed-view-family.test.ts` | design-system | Update (view family stays closed at 4 layouts) |
| `packages/web/src/components/__tests__/ArtifactSection.test.tsx` | web | Update fixture data for new Artifact shape |

---

## 10. Ordered Task List

### Task 1: Kind Definition infrastructure (shared)

**Files:** `packages/shared/src/kinds/*.ts`, `packages/shared/src/types/artifact.ts`, `packages/shared/src/index.ts`

**Steps:**
1. Create `packages/shared/src/kinds/kind-definition.ts` with the `KindDefinition` interface
2. Create 6 kind definition modules (`text.ts`, `code.ts`, `image.ts`, `data.ts`, `html.ts`, `url.ts`) with Zod schemas, displayTitle, and summarize functions
3. Create `packages/shared/src/kinds/registry.ts` with the registry map, `ARTIFACT_KINDS`, `getKindDefinition`, `isRegisteredKind`
4. Create `packages/shared/src/kinds/old-kind-map.ts` with the old-to-new kind mapping
5. Update `packages/shared/src/types/artifact.ts`: replace closed enum with re-exports, add `label` to Artifact, delegate summarize/displayTitle
6. Update `packages/shared/src/thread.ts`: widen `artifactKind` to `string`
7. Update `packages/shared/src/index.ts`: update exports

**Tests:** Update `packages/shared/src/__tests__/artifact-types.test.ts`

**Depends on:** Nothing

### Task 2: Database migration (db)

**Files:** `packages/db/src/schema.ts`, `packages/db/drizzle/0027_AE6_artifact_extensibility.sql`

**Steps:**
1. Add `label` column to artifacts table in schema.ts
2. Write migration SQL
3. Run `npm run db:generate` to verify migration is consistent with schema

**Tests:** Migration runs without error (verified by `npm run db:migrate`)

**Depends on:** Nothing (can run in parallel with Task 1)

### Task 3: Server schema and routes (server)

**Files:** `packages/server/src/schemas/artifact-preview.ts`, `packages/server/src/routes/artifacts.ts`, `packages/server/src/routes/bets.ts`, `packages/server/src/skill-tools/create-artifact.ts`

**Steps:**
1. Update `artifact-preview.ts` to compose from per-kind schemas
2. Update `artifacts.ts` routes: new create schema (6 kinds + label), read-time normalization with OLD_KIND_MAP, label in response
3. Update `bets.ts`: remove unknown_kind normalization
4. Update `create-artifact.ts`: 6-kind enum, label parameter

**Tests:** Update integration tests for all affected routes

**Depends on:** Task 1 (needs shared types), Task 2 (needs label column)

### Task 4: Kind renderers (web)

**Files:** `packages/web/src/kinds/*.tsx`, `packages/web/src/kinds/renderer-registry.ts`

**Steps:**
1. Create renderer-registry.ts with lazy loading
2. Create 6 kind renderer components
3. Create fallback-renderer.tsx

**Tests:** Unit tests for each renderer, component tests for rendering

**Depends on:** Task 1 (needs shared types)

### Task 5: ArtifactView restructure (web)

**Files:** `packages/web/src/shell/ArtifactView.tsx`

**Steps:**
1. Replace 5-shape discriminated union with kind-based dispatch using renderer registry
2. Update MetadataStrip to show label
3. Add Suspense boundary for lazy-loaded renderers

**Tests:** Update ArtifactView tests

**Depends on:** Task 4 (needs renderer registry)

### Task 6: Delete artifactToView.tsx (web)

**Files:** `packages/web/src/shell/artifactToView.tsx` (delete), test file (delete)

**Steps:**
1. Update all consumers that import `artifactToViewProps` to use the new ArtifactView props
2. Delete `artifactToView.tsx` and its test

**Tests:** Verify no remaining imports

**Depends on:** Task 5 (consumers must be updated first)

### Task 7: Design system updates (design-system)

**Files:** `packages/design-system/src/ArtifactKindBadge.tsx`, `ArtifactPreviewSurface.tsx`, `ArtifactGalleryCard.tsx`, `ArtifactStackItem.tsx`, `ArtifactPreview.tsx`, `ArtifactEmbed.tsx`

**Steps:**
1. Widen ArtifactKindBadge.kind to string
2. Update ArtifactPreviewSurface to use Kind Definition summarize
3. Add label display to gallery card, stack item, preview, embed

**Tests:** Update all DS component tests

**Depends on:** Task 1 (needs shared types)

### Task 8: Integration testing and cleanup

**Steps:**
1. Run `npm run check` -- zero type errors
2. Run `npm run lint` -- zero lint errors
3. Run `npm run test:all` -- all green
4. Verify the "blog_post" validation scenario: create a Kind Definition for a hypothetical `blog_post` kind, verify it works without modifying core files (this is a test, not production code)
5. Verify the fallback scenario: send an artifact with an unregistered kind, verify fallback renders

**Depends on:** All previous tasks

---

## 11. Acceptance Criteria with Verification Methods

### AC-1: New artifact kinds can be added without modifying core source files

**Verification:** Unit test creates a mock Kind Definition for kind `blog_post`, registers it, and verifies:
- `getKindDefinition("blog_post")` returns the definition
- `isRegisteredKind("blog_post")` returns true
- The preview schema validates blog_post preview data
- `summarizePreview` delegates to the blog_post definition
- `artifactDisplayTitle` delegates to the blog_post definition

Additionally verified by the type system: `npm run check` passes. The `KindDefinition` interface is the only contract a new kind must satisfy.

### AC-2: Each kind defines its own preview schema and renderer

**Verification:**
- Unit test: each of the 6 Kind Definitions exports a valid `KindDefinition` with all 5 members
- Unit test: each kind's preview schema validates correct data and rejects incorrect data
- Component test: each renderer component renders its populated state correctly
- Component test: fallback renderer renders unregistered kind preview as key-value pairs

### AC-3: Existing 13 kinds continue to work

**Verification:**
- Integration test: POST an artifact with old kind `contract`, GET it back, verify it returns `kind: "text"` and `label: "contract"`
- Integration test: POST an artifact with old kind `code_diff`, GET it back, verify `kind: "code"` and `label: null`
- Read-time normalization test: insert a row with old kind directly in DB, read via API, verify normalization applies
- Unit test: `OLD_KIND_MAP` covers all 13 old kinds (12 + unknown_kind)

### AC-4: The extensibility model is documented for contributors

**Verification:** Documentation exists at `docs/process-layer/artifact-primitive.md` (already updated by concept) describing:
- The 6 fundamental kinds and their meanings
- How to add a new kind (create Kind Definition module + add to registry)
- The label system

This is a static property verified by reviewing the doc content, not a runtime test.

---

## 12. Security and Abuse Cases

| Vector | Applicable? | Mitigation |
|---|---|---|
| **Rate-limit on POST /api/artifacts** | Yes | Existing rate limiting applies. No change needed. |
| **Agent-authored kind field** | Yes | Constrained to `z.enum(ARTIFACT_KINDS)` at create. Agents cannot write arbitrary kinds. |
| **Agent-authored label field** | Yes | Constrained to `z.string().regex(/^[a-z][a-z0-9_]*$/).max(64)`. No HTML injection, no arbitrary strings. |
| **HTML preview content (XSS)** | Yes | Sandboxed iframe with `sandbox="allow-scripts"` (no allow-same-origin). The iframe cannot access parent page DOM, cookies, or storage. |
| **HTML preview content (resource exhaustion)** | Yes | The `PREVIEW_BODY_LIMIT` (64KB) caps the size of preview JSON. This limits the HTML content size. |
| **Path traversal** | N/A | No path inputs in AE6. |
| **SSRF** | N/A | No outbound URL fetching. The url kind stores a URL string but never fetches it server-side. |
| **Secret handling** | N/A | No new credentials. |
| **Preview schema bypass** | Yes | For unregistered kinds, the fallback schema accepts any JSON object. This is intentional (open vocabulary) but the 64KB body limit prevents abuse. |

---

## 13. Protected Tests

Tests whose assertions document existing contracts and should not be weakened:

```
protectedTests:
  - packages/design-system/src/__tests__/closed-view-family.test.ts  # view family stays closed at 4 layouts
```

All other test files listed in section 9 are expected to be updated as part of AE6.

---

## 14. Risks and Ambiguities

1. **Preview JSON stale kind discriminants.** After migration, preview JSON blobs still contain old kind values (e.g., `{"kind": "code_diff", ...}`). The read-time re-mapping in `rowToArtifact` handles this, but if a preview's structure doesn't match the new kind's schema even after re-mapping, preview becomes null. Risk: some artifacts lose their preview display. Mitigation: the 12 old kinds map cleanly to the 6 new kinds, and the preview data structures are compatible (e.g., `code_diff` preview has `file` + `hunks`, which is exactly what the `code` kind expects).

2. **Zod discriminated union with dynamic composition.** Composing a Zod discriminated union from an array of schemas requires careful typing. The `z.discriminatedUnion` API expects a tuple type, not an array. Implementation may need a type assertion. Risk: type safety at the composition point. Mitigation: the composition happens once at module load; runtime behavior is correct even if the type assertion is needed.

3. **React.lazy SSR compatibility.** If HyperIdle ever adds SSR, React.lazy won't work server-side. Risk: future SSR migration. Mitigation: low priority since HyperIdle is a desktop-first SPA. The lazy boundary can be replaced with a synchronous registry if SSR is needed.

4. **ArtifactView prop change breaking consumers.** The ArtifactView component changes from a 5-shape discriminated union to a flat `kind + preview` interface. All consumers must be updated. Risk: missed call sites. Mitigation: `npm run check` catches any consumer passing the old props shape.
