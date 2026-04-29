# L1 Slop Scan — `feat/L1-thread-primitive` (HEAD `5de1c32`)

Scope: commits `5b08030` and `5de1c32`. Read-only scan against the AI-aesthetic blacklist (AQ-101..113), the strict-TS rules in `.claude/rules/typescript.md`, and the AI-coding anti-pattern list in the slop-scan skill.

## CRITICAL

- **packages/design-system/src/CommentRow.tsx:32, 105, 106, 111, 114, 116, 118, 124** — repeated unsafe `as` casts on `message.payload`. Rule: `.claude/rules/typescript.md` ("no unsafe `as` casts"). The `Message` type in `packages/shared/src/thread.ts:126-142` is already a discriminated union — `payload` narrows from `message.type` automatically. Each `as { decision: string }` / `as { text: string }` / `as { redactedBy: string }` / `as { reason: string }` / `as { note?: string }` defeats the discriminated union you spent the type budget building. Surgical fix: pull the `payload` once after the type/redaction discriminator (`if (message.type === "verdict") { const p = message.payload; ...`) and let TS narrow. The `RedactedPayload` branch needs `isRedactedPayload` to be a true type guard, which it already is — narrowing should flow through.

- **packages/design-system/src/ThreadHead.tsx:28-31, 69** — same anti-pattern: `message.payload as { title: string; reasoning: ReadonlyArray<string> }` and `as { title: string; question: string }`. The discriminated union already narrows `payload` to `ReviewPayload | RedactedPayload` after `if (message.type === "review")`. After a `!isRedactedPayload(payload)` guard, TS gives you the typed object for free. Remove the casts and use guards.

## WARNING

- **packages/design-system/src/ThreadShell.tsx:132** — `headMessage.payload as { artifactRef: ArtifactRef }`. Same family: after `headMessage.type === "review"`, payload is `ReviewPayload | RedactedPayload`. Add a redaction guard, then access `.artifactRef` directly.

- **packages/web/src/pages/ConversationsReview.tsx:39, 43, 62** — three `as` casts: `(await res.json()) as ThreadDetail` (twice) and `(cause as Error).name`. Network responses are genuinely `unknown`; the right tool is a Zod parse at the boundary (you already ship Zod in the server). The `cause as Error` cast on line 43 is unnecessary — use `cause instanceof Error ? cause.name === "AbortError"` instead, mirroring line 44.

- **packages/server/src/routes/threads.ts:84** — `JSON.parse(row.participants) as ReadonlyArray<Thread["initiatorId"]>`. The DB column is plain `text`; the parsed value is genuinely `unknown`. Validate with a Zod schema or `z.array(z.string()).parse(...)` before trusting it. Same problem at line 103: `JSON.parse(row.payload) as Message["payload"]` — and at line 166 inside the participant_id filter where you cast to `string[]`. A malformed row causes a runtime crash later in the request, away from the parse site.

- **packages/server/src/routes/threads.ts:104** — `} as Message;` outer cast on the `rowToMessage` return value to launder the discriminated union. The cast is load-bearing because the function literally cannot prove the `type`/`payload` invariant without parsing. Same fix as above: parse with Zod, then return.

## SUGGESTION

- **packages/design-system/src/ThreadHead.tsx:78** — `<div className="text-[12px] text-[var(--text-lo)] italic">Answer UI coming in L1b</div>` is a placeholder string in committed source. Not Lorem ipsum, but adjacent. Either gate this branch behind a feature flag, or render an `EmptyState` with a proper description, or remove the `questionnaire` head entirely until L1b ships. Right now the rendered output reads like a TODO leaked into UX.

- **packages/design-system/src/ReviewVerdictBar.tsx:29** — local `interface ButtonSpec` is a fine name, but the file already uses three module-private constants of the same shape (`BINDING`, `NON_BINDING`, `SIDECAR`). Consider a const tuple `[action, label, tone]` to remove the type entirely; it shaves a declaration without losing safety.

- **packages/design-system/src/ThreadHostBanner.tsx:67** — `participants.slice(0, 3)` hardcoded. Not slop per se, but the magic number deserves a `MAX_AVATARS = 3` constant given the surrounding plan-driven discipline.

- **packages/web/src/pages/ConversationsReview.tsx:21** — `const FALLBACK_THREAD_ID = "demo-thread-1"` shipped to production. Not Lorem, but a demo fixture in production code path. Either delete (let the empty/error state handle missing id) or guard behind dev-mode.

## What was checked and came up CLEAN

- AQ-101 `rounded-2xl`/`rounded-3xl` — none in L1 source or HTML refs.
- AQ-102 indigo/purple/violet/fuchsia/pink gradients — none.
- AQ-103 oversized padding (`p-8`+) — none; components use `var(--density-pad-*)`.
- AQ-104 hero sections in `pages/work/**` — N/A (L1 doesn't touch that path).
- AQ-105 emoji in `Button`/`NavItem`/`StatusChip` text — none. Composer ships a `⌘+Enter` legend; that's a keyboard glyph in a hint label, not iconography on a button.
- AQ-106 page-level `text-center`/`mx-auto` — none in `ConversationsReview.tsx` or `ThreadSections.tsx`. (`mx-auto` appears in `html/ThreadShell.html:21` as design-system frame demo chrome — not product chrome.)
- AQ-107 glass morphism / `backdrop-blur` — none.
- AQ-108 3-column identical card grid — none.
- AQ-109 Lorem ipsum / "Click here" — none.
- AQ-110 marketing superlatives — none in source, HTML, plan, or HIL.md.
- AQ-111 gradient-on-text — none.
- AQ-112 nav-rail full-bleed accent — N/A.
- AQ-113 over-iconification — `CommentRow` does not accept an `icon` prop and renders no placeholder when sender has no avatar (it falls back to the initial — that's content, not icon padding). OK.
- Generic suffixes (`Manager`/`Service`/`Handler`/`Wrapper`) — none in L1 files.
- `console.log` / `console.warn` — none.
- `any` / `@ts-ignore` — none.
- Default exports — none; named exports throughout.
- Per-callsite `biome-ignore` — two instances, both with attached justifications: `ThreadHead.tsx:52` (immutable index for reasoning lines) and `threads.ts:315` (transactional cohesion). Acceptable.
- Emoji in commit messages — none. (The `⚠️` flag on `thread.ts:52` is doc-language matching the repo's `⚠️ UNVERIFIED` convention from `.claude/rules/typescript.md`.)
- "production-ready"/"battle-tested"/"robust"/"industry-standard" copy — none.
- Commented-out alternative blocks — none.

## VERDICT

**SLOP** — 2 CRITICAL clusters of unsafe `as` casts in `CommentRow.tsx` and `ThreadHead.tsx` violate `.claude/rules/typescript.md` and dismantle the discriminated union the schema was built around. Aesthetic side: clean.
