# AE5 Design — Communication Refinements

**Classification:** Routine. All three surfaces compose from existing component families (CommentRow, ThreadHostBanner, ThreadRow, StatusChip) within known layouts (Conversations detail, thread list, team roster). No new custom components required.

**Approach:** Single variant + "did we consider" checks. The concept is locked; the design decisions are about WHERE and HOW existing primitives render, not about new shapes.

---

## Surface 1: @Mention rendering in messages

### User task

A participant types `@name` in the Composer and expects the sent message to highlight the mention and the mentioned person to be pulled into the thread.

### Design decisions

**1.1 Composer — no client-side autocomplete (v1).** The Composer stays unchanged. The user types raw `@name` text. The server resolves mentions at write-time and returns the message with structured `MentionRef` entries. Autocomplete is deferred — it requires a name search endpoint, a dropdown component, and keyboard navigation. The concept explicitly states "Unknown `@name` tokens are left as plain text" — the server is lenient, so the user gets feedback on send (resolved mentions highlight; unresolved text stays plain).

**Why defer autocomplete:** Adding a typeahead dropdown to Composer would add a new custom component (or significantly expand Composer's scope), require a new API endpoint, and introduce focus/keyboard complexity. The server-authoritative resolution means mentions work without it — autocomplete is a polish feature for a future workpackage.

**1.2 Message body — inline highlighted token.** When CommentRow renders a `plain` message whose `PlainPayload.refs[]` contains one or more `MentionRef` entries, each `@name` occurrence in the text is replaced with a highlighted inline span.

Visual treatment:
- Background: `var(--accent-primary)` at 8% opacity (`color-mix(in oklab, var(--accent-primary) 8%, transparent)`)
- Text: `var(--accent-primary)`
- Font: inherit from surrounding text (15px, text-secondary context)
- Padding: `1px 3px` (sub-grid exempt, internal inline padding)
- Border-radius: `var(--r-pill)`
- Prefix: `@` is visible in the rendered token (e.g., `@Aria`)

This treatment is distinct from:
- EntityRef embeds (which render as BlockRefEmbed cards below the message body)
- BlockRef embeds (which also render as cards)
- Plain text links (underlined, no background)

The mention span is **not interactive** in v1. No click-to-navigate, no hover card. It is a visual marker that says "this person was pulled in." Click-to-profile is deferred until there is a clear navigation target (agent profile page exists, human profile does not yet).

**1.3 Where mention rendering happens.** The mention-to-span replacement is a text transformation applied inside CommentRow's `MessagePayloads` component. The `MentionRef` entries in `refs[]` carry `displayName` and the original `sourceText` — the renderer scans the text for each `sourceText` occurrence and wraps it in the styled span. This keeps the transformation local to the message renderer (design-system layer) without leaking into the shared-layer derivePayloads pipeline.

**1.4 Self-mention suppression.** Per the concept: "Mentioning yourself is a no-op." The server suppresses the participant-addition side effect, but the `@name` text still renders as a highlighted mention token. This is intentional — the text should show what the user typed, even if it had no effect.

### States

| State | Rendering |
|---|---|
| Message with 0 MentionRefs | Standard plain text rendering (unchanged) |
| Message with 1+ MentionRefs | `@name` tokens highlighted inline; other text unchanged |
| Message with unresolved `@foo` | Plain text `@foo` — no highlight, no error indicator |
| Redacted message | Entire payload replaced; mentions are not visible |

---

## Surface 2: Thread context link

### User task

When viewing a thread in the Conversations detail, the user wants to know what this thread is attached to (a bet, a task, a session) and navigate there.

### Design decisions

**2.1 Thread context link in the page header.** The Conversations detail page already renders a `<header>` with the thread title and optional dial-in button. The thread context link is added as a breadcrumb-style element in this header, below the title.

Layout:
```
[header]
  [h2] Thread title (existing)                    [Dial In] (existing)
  [Tag: hostKind] [link: hostTitle] →
[/header]
```

The context link line:
- `Tag` component with `label={thread.hostKind}` — reuses the existing Tag primitive (Tier 1)
- Linked host title: `<a>` or `<Link>` styled as `text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline`
- A small right-arrow indicator (`→` character, `text-[var(--text-tertiary)]`) after the link

**2.2 Navigation targets.** The link resolves to an existing page based on `hostKind`:

| hostKind | Route | Exists? |
|---|---|---|
| bet | `/work/bet/:hostId` | Yes |
| task | `/work/task/:hostId` | Yes |
| knowledge_item | `/knowledge/:hostId` | Yes |
| artifact | `/work/artifact/:hostId` | Yes |
| agent | `/work/agent/:hostId` | Yes (AgentProfile) |
| user | No link (self-referential) | N/A |
| team | `/work/team/:hostId` | Yes |
| factory | No link (global scope) | N/A |

For `user` and `factory` host kinds, the context link line renders the Tag + title as plain text (no anchor). These are DM and feed threads — the "host" is the user themselves or the factory, not a navigable work entity.

**2.3 Host title resolution.** The server already returns `identities` in the thread detail response. For host kinds that are entities (bet, task, etc.), the host title should come from the entity's actual title. Two options:

- **Option A (v1, chosen):** Use the identity name if available in `identities[thread.hostId]`, otherwise fall back to the hostId string. This works today without server changes because the identity map already resolves user/agent names. For bet/task/knowledge_item hosts, the hostId is an opaque UUID — not human-readable. We accept this limitation in v1.
- **Option B (deferred):** Add a `hostTitle` field to the thread detail API response that resolves the actual entity title server-side. This is the correct long-term solution but requires a server change per host kind.

For v1, the thread detail page already computes `threadTitle` as `identities[thread.hostId]?.name ?? thread.hostId`. The context link reuses this. For non-identity hosts (bets, tasks), the display will show the UUID — this is acceptable for v1 because most threads in daily use are DMs (agent/user hosted) or task-hosted (where the user already knows the task from context).

**Improvement path:** A follow-up workpackage should add `hostTitle` to the `GET /api/threads/:id` response. The architecture plan below includes a `hostTitle` field in the response for host kinds where title resolution is straightforward.

**2.4 Visibility rule.** The context link is shown ONLY when `hideHostBanner` is false OR when the Conversations page renders its own header. In the Conversations detail view, `hideHostBanner=true` (the page renders its own header) — the context link appears in the Conversations page header. In other ThreadShell consumers (HostThreadSection on bet/task/knowledge pages), the ThreadHostBanner already shows the host information — no additional context link needed.

**2.5 ThreadHostBanner enhancement.** The existing ThreadHostBanner renders `hostKind` as a Tag and `hostTitle` as plain text or a link (via `hostHref`). It already supports the `hostHref` prop. The enhancement is on the consumer side: the Conversations page passes the resolved URL to the ThreadHostBanner's `hostHref` prop. No ThreadHostBanner component changes needed — just wiring in the consumer.

Wait — `hideHostBanner=true` in Conversations, so the banner is not shown. The context link goes into the page header instead. This is the right approach: the Conversations page owns its header layout.

---

## Surface 3: Agent presence indicators

### User task

When looking at a thread or a conversation list, the user wants to know if an agent participant is currently working (active session) or idle.

### Design decisions

**3.1 Presence dot on participant avatars in ThreadHostBanner.** The ThreadHostBanner renders participant avatars as 24px circles with initials. For agent participants with `active` operational status, add a 6px status dot in the bottom-right corner of the avatar circle.

Dot treatment:
- Active: `var(--accent-primary)` (green dot)
- Idle: no dot (absence = idle)
- Error: `var(--status-error)` (red dot)

The dot is a standard presence indicator pattern. It is rendered conditionally — only for participants where the consumer provides operational status data. No dot = no status data available (human participants, or status not yet fetched).

**3.2 Data source for presence.** The thread detail API response currently returns `identities` as `Record<string, { name: string; role?: string }>`. To support presence indicators, the response needs to include `operationalStatus` per identity. Two options:

- **Option A (chosen):** Extend the identities map to include optional `operationalStatus?: AgentOperationalStatus` and optional `isAgent?: boolean`. The server looks up the user's `kind` column and, for AI users, derives operational status from their most recent session state. This is a backward-compatible extension (new optional fields).
- **Option B (deferred):** Separate endpoint for participant presence. Overkill for the current use case.

The identities extension is small: for each sender in the thread, the server already queries the `users` table. Adding a LEFT JOIN to `sessions` for the most recent active session per agent user is a single additional query.

**3.3 Presence in the thread list (ThreadRow).** The ThreadRow component already accepts an `avatars` prop with `ThreadAvatarItem[]` where each item has `{ initials: string; agent?: boolean }`. Extending `ThreadAvatarItem` with an optional `operationalStatus` field allows the ThreadRow to render the same 6px presence dot on avatar circles in the conversation list.

This gives presence visibility at two levels:
- Thread list: see which threads have active agents
- Thread detail: see which participants are currently working

**3.4 Presence in WorkTeam AgentRow (existing).** The WorkTeam page already renders operational status. No changes needed there — AE5 is about extending presence to conversation-centric surfaces.

**3.5 No presence for human participants.** Per the AE5 spec: "Human presence deferred." Only agent participants get presence indicators. The `isAgent` flag on the identity determines whether to render the dot.

### States

| State | ThreadHostBanner | ThreadRow |
|---|---|---|
| Agent participant, status=active | Green dot on avatar | Green dot on avatar in avatar group |
| Agent participant, status=error | Red dot on avatar | Red dot on avatar in avatar group |
| Agent participant, status=idle | No dot | No dot |
| Human participant | No dot | No dot |
| Status unknown (no data) | No dot | No dot |

---

## Cross-cutting: "Did we consider" checks

**New custom component?** No. All rendering uses existing components (CommentRow, ThreadHostBanner, ThreadRow, Tag, StatusChip) or standard HTML elements (`<span>`, `<a>`). Mention rendering is an inline `<span>` within CommentRow. Presence dots are small positioned elements within existing avatar rendering. Context links are standard anchor elements. Component budget is untouched.

**Mobile?** The three-tab mobile layout is unaffected. Mentions render identically (inline text). Context links are tappable. Presence dots are visible at 6px on mobile. All touch targets meet the 44px minimum (the context link line has adequate height from the 13px text + padding). No mobile-specific design needed.

**Keyboard/accessibility?** Mention spans are not interactive (no tab stop). Context links are standard anchors (keyboard-navigable by default). Presence dots carry `aria-label` for screen readers ("Agent Name - active" / "Agent Name - error").

**Empty states?** No new empty states. A thread with zero mentions just renders normally. A thread with no agent participants shows no presence dots. A thread with `user` or `factory` host kind shows no context link.

**Performance?** Mention text scanning is O(n*m) where n = text length, m = mention count. For typical messages (< 10K chars, < 5 mentions), this is trivial. No concern. Presence data adds one extra query to the thread detail endpoint — bounded by participant count (typically 2-5).

**Error cases?** If the server fails to resolve an `@name`, it stays as plain text. If the host entity doesn't exist (orphan thread), the context link renders with the raw hostId. If operational status fails to load, no dots render.

---

## Rendering specification summary

### Mention token (inline span in CommentRow)

```
<span
  class="inline-flex items-center px-[3px] py-[1px] rounded-[var(--r-pill)]
         bg-[color-mix(in_oklab,var(--accent-primary)_8%,transparent)]
         text-[var(--accent-primary)] font-inherit"
>
  @{displayName}
</span>
```

### Presence dot (on avatar circles)

```
<span
  class="absolute bottom-0 right-0 w-[6px] h-[6px] rounded-full
         border-[1.5px] border-[var(--surface-elevated)]
         bg-[var(--accent-primary)]"
  aria-label="{name} - {status}"
/>
```

### Context link (in Conversations header)

```
<div class="flex items-center gap-[6px] text-[13px]">
  <Tag label={hostKind} />
  <a href={hostRoute} class="text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline">
    {hostTitle}
  </a>
</div>
```
