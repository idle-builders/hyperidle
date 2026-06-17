# AM1 — Conversation Surface: Master Inventory & Gap Analysis

Synthesis of five research dossiers (`slack-team-chat.md`, `ai-chat-surface.md`, `agentic-coding-chat.md`, `composer-and-actions.md`, `hyperidle-current-state.md`) + the founder's Round-1 annotations. Purpose: map **everything a useful threaded + AI conversation needs**, mark have/partial/absent in HyperIdle, and surface the decisions that gate the redesign.

The founder's verdict on v1/v2: *"far from the basics… missing spacing, grouping, structure, layering, layout… who wrote what / me vs them / multiple users… what's a thread vs a conversation… the composer is a stub… show it in the real app container."* This inventory exists so the next design is grounded, not guessed.

---

## 0. THE FORK THAT GATES EVERYTHING — "conversation" vs "thread"

- **Slack model:** *conversation = container* (channel/DM); a *thread* = a reply-branch off one message (enter via "N replies" → focused pane), kept out of the main list; optional "also send to channel".
- **HyperIdle today:** a **Thread IS the whole conversation** — 1:1, flat, append-only, attached to exactly one host (bet/task/knowledge_item/artifact/agent/user/team/factory). **No sub-threading.** (`thread.ts`; `part-model.md:34` "Conversation ↔ Thread is 1:1"; concept hard rule 5 freezes Thread/Message/verdict.)
- **The founder expects Slack-style threading** ("where do I jump into a thread"). Our vocabulary collides: we call the container a "Thread"; the founder reads "thread" as a branch.

**This is a concept decision (changes the primitive + schema). See §9.**

---

## 1. Navigation & IA — finding/entering a conversation
| Need | Job | HyperIdle |
|---|---|---|
| Conversation list / sidebar + sections | "what needs me" | **partial** (Conversations.tsx submenu, ordering by blocking) |
| Unread badges, mentions inbox, threads inbox | triage | **absent** (no unread/mention/threads views) |
| Search (operators), jump-to (⌘K) | retrieval | **absent**/partial (GlobalSearchPanel exists, not chat-scoped) |
| Pins, saved/later, files browser | retrieval | **absent** |

## 2. Conversation framing — what THIS conversation is
| Need | Job | HyperIdle |
|---|---|---|
| Host attachment shown (bet/task/team/user) | context | **have** (ThreadHostBanner) — but founder: "why TASK? is this a thread or a conversation?" → framing unclear |
| Participants / members | who's here | **partial** (participants[] in data; weak in UI) |
| Title / what it's about | orientation | partial |

## 3. Message rendering & identity  ← founder's #1 gap
| Need | Job | HyperIdle |
|---|---|---|
| Sender identity: avatar + name + time | who wrote this | **regressed** — v2 stripped it to near-zero; must restore, calmly |
| Consecutive-author grouping | calm bursts | **have** (5-min window) — keep, but show identity at group head |
| Human vs agent distinction | trust | partial (agent tint) — make legible |
| **Me vs them / multi-user** | "what's mine vs theirs, 3+ people" | **absent** — Slack does this WITHOUT bubbles: single column, identity at group head, subtle own-message cue. Multi-user untested. |
| Markdown / code / tables / math | rich text | **have** (renderers) |
| Streaming / "thinking" disclosure | liveness | partial |

## 4. Message actions (hover toolbar + overflow)
| Need | Essential? | HyperIdle |
|---|---|---|
| React (emoji) | essential | **absent** (needs schema) |
| Reply / reply-in-thread | depends on §0 | **absent** |
| Edit / delete (author) | essential | partial (soft-delete/redact in data; no UI) |
| Copy / copy-link (permalink) | essential | **absent** |
| Pin / save / forward / mark-unread | later | absent |

## 5. Embeds / content Parts — the AM1 thesis
| Need | Job | HyperIdle |
|---|---|---|
| Artifact embed → opens side pane, versioned | "the answer you keep" | **partial** (ArtifactEmbed; no side-pane/versioning) |
| Referenced block/item inline | reference in place | **have** (BlockRefEmbed) |
| Diff / change-set embed (foldable, +N/−M) | review work | partial (concept named; not built) |
| **Citations / sources** | trust/provenance | **absent** — strong borrow from Perplexity |
| Link unfurl / preview | context | absent |
| File / image attachment | share | **absent** |
| Session-reference embed → dial-in (AM3) | work, not work-log | concept'd, not built |
| Founder: "if I open this, where do I end up?" | embed destination must be defined | — |

## 6. Agent-work integration (agents-as-teammates)
Convergent research finding: an agent should post like a human colleague — **a deliberate summary message + an embedded reviewable change-set/artifact + an explicit ask** — with the raw work folded into a **referenced session**, never inlined. Approval = a single **verdict** (approve / request-changes / reject) on the change-set, not per-hunk. HyperIdle's verdict semantics already encode this; the session-reference + work-fold render it. **This is our differentiator and the research validates it.**

## 7. The Composer ← founder's loudest gap ("no send, attach, format, tools; not centered")
Minimum-viable anatomy (from `composer-and-actions.md`): bottom-pinned card centered in the column.
```
[ optional banner: replying to… / editing… / unresolved review ]
[ attachment chips (remove · progress) — only when files attached ]
[ +  Aa | auto-sizing textarea …………………………… | Send ]
```
- **Send:** Enter sends · Shift+Enter newline · ⌘/Ctrl+Enter always-send; disabled-when-empty; "Sending…".
- **Attach:** paperclip/"+" + drag-drop + paste-image → chips.
- **Format:** bold/italic/code/code-block/link/quote/list (markdown + minimal `Aa` toggle).
- **@mention autocomplete:** people / agents / **artifacts+blocks** — *this is how a message authors an Embed* (load-bearing).
- **`/` commands + "+" tools menu**, `:emoji:` typeahead, per-thread **draft** autosave, ↑-edit-last, autosize, a11y/≥44px.
- **NOT here:** model / reasoning-effort / mode / web-search / permission → these are the **AM3 session dial-in** (capability pills), not the everyday composer. (Putting them here rebuilds t3's rejected "composer = run config.")

## 8. Multi-user / presence / notifications
Members, presence dots, typing, **@mention as the notification primitive** (not every-message), read state, unread counts. HyperIdle: mostly **absent**; @mention data exists, no notification wiring in the surface.

---

## 9. STRESS ON THE LOCKED CONCEPT (what must be revisited)

The locked AM1 concept committed to: Part model, Embed, Fold, Session-reference, deliberate-messages-not-work-log, **and hard rule 5: Thread/Message/verdict unchanged.** That last rule **blocks the basics the founder is asking for:**
- **Reactions, attachments, edit/delete-UI, sub-threading** all need Message/Thread schema changes → forbidden by hard rule 5 as written.
- The **thread-vs-conversation** model (§0) is a primitive-level decision.
- **Identity / me-vs-them / multi-user** rendering wasn't in the concept's scope at all.

**Conclusion:** AM1 as locked = "calm rendering + embeds." The founder is describing a **full conversation primitive** (Slack-grade threading & actions + AI-grade embeds/artifacts + a real composer). That is bigger than the locked concept. **The concept must be revisited/expanded before redesigning.**

---

## 10. Load-bearing decisions (founder)

1. **Thread/conversation model** — (a) keep flat 1:1, just *name & frame* it clearly (Conversation = the surface; no sub-threads); (b) adopt **Slack-style threading** (a conversation holds messages; any message can spawn a reply-thread) — reshapes the primitive + schema; (c) **hybrid** (host-attached conversation + lightweight reply-threads for tangents only).
2. **Scope** — expand AM1/Track-AM to a **full chat surface now** (reactions, message actions, attachments, formatting, composer toolkit, multi-user → concept + primitive grow), or **stage** it (lock the model + composer + identity first, add reactions/attachments later).
3. **Identity / me-vs-them** — Slack-style single-column + grouped identity + subtle own-message cue (recommended; no bubbles), confirmed at design time.

## 11. Recommended path
1. **Revisit `/concept`** for decisions 1+2 (the conversation primitive: threading model + scope + identity + the full Part/Embed/action/composer surface). This unblocks everything.
2. **Richer design brief** grounded in this inventory (every §1–§8 area has a target).
3. **Redesign embodied in the REAL app container** (shell + conversation sidebar + main pane), not a bare floating column — per the founder's annotation.
4. Designer + reviewer think deep against this inventory → critique → human-design-review.
