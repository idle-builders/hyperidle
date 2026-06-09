# AD8b Design Brief -- Assistant Agent + Overlay

DESIGN-CLASS: routine  ref=CocOverlay+ThreadShell  pattern=ThreadShell.html

## Classification rationale

Both axes match. CocOverlay is an existing Tier 3 shell composition. ThreadShell.html is the embodied pattern. The work is extending the overlay to render three new content types (tool calls, artifacts, review messages) and adding a settings section for the soul prompt. No new design-system primitive required.

## User task

A solo founder talks to their personal AI assistant through a persistent overlay. The assistant can read data (no gate) and take actions on behalf of the user (write actions gated by risk level). The user needs to:

1. **Ask questions** -- type into the composer, get answers with inline data references.
2. **Approve risky actions** -- the assistant proposes high-risk actions as review messages; the user approves/rejects before execution.
3. **See what the assistant did** -- tool call results and created artifacts are visible inline, not hidden behind "the assistant did something."
4. **Attach context** -- grab a bet, task, knowledge item, block, or message and pin it to the conversation as input for the assistant.
5. **Customize the assistant** -- edit the soul prompt in settings.

## Probes and answers

**Q1: What is the primary state?** Populated with a mix of plain messages, tool-call results, and occasional review messages. The overlay is used daily for quick interactions, not long sessions.

**Q2: What decision is the user making?** Two decisions: (a) "Is this information what I asked for?" (read-only queries) and (b) "Should the assistant proceed with this action?" (review-gated writes). Decision (b) is the load-bearing interaction.

**Q3: What gets truncated at 360px width?** Tool call names, entity references, and reasoning lines. The 360px constraint is tight -- the overlay cannot be a full thread view. It must be a focused conversation strip.

**Q4: New component or extension?** Extension. CocOverlay already renders ThreadShell. The change is: (a) ThreadShell already handles review messages via RichMessageCard, (b) tool-call results need a new inline rendering in CommentRow, (c) artifacts need the existing artifactSlot pattern.

**Q5: What is the interaction grammar for review messages in the overlay?** The same as everywhere else: RichMessageCard with verdict buttons (Approve / Approve with comments / Request changes / Edit / Reject). The overlay is 360px wide, so the buttons stack vertically instead of wrapping horizontally.

**Q6: Does the assistant overlay render differently from a Conversations thread?** Yes, in two ways: (a) it is a fixed-position floating panel, not a full-page view, and (b) it includes the context-chip area above the composer for attached entities. But the message rendering inside is identical -- ThreadShell handles both.

## Existing infrastructure reused

- **ThreadShell** -- composition root (banner + stream + composer). Already supports review/questionnaire messages, verdict dispatch, artifact slots, ref embeds.
- **RichMessageCard** -- review/questionnaire card with verdict buttons. Already handles blocking, saving, error, resolved states.
- **CommentRow** -- plain message rendering. Already supports richHeader/richBody/richActions slots for review-type messages, afterBody for ref embeds, sanitizeHtml for HTML blocks.
- **Composer** -- input + send button. Already handles submit, focus, disabled states.
- **CocContext** -- provides overlayOpen + attachContext to cards in Main.
- **CocAttachButton** -- "+" button on cards when overlay is open.
- **ContextChip** -- kind label + entity label + dismiss button. Already renders above the composer.

## What is genuinely new

1. **Tool-call result rendering in CommentRow** -- when the assistant responds with tool results (e.g. "created task X", "found 3 blocked tasks"), these need inline rendering. NOT a new component -- this is a new payload variant rendered through CommentRow's existing richHeader/richBody slot pattern.
2. **Settings soul-prompt section** -- a textarea in SettingsPage for editing the assistant's soul prompt. Extends the existing stacked-sections layout.
3. **Conditional pinning** -- the thread starts unpinned and pins after the first assistant response. This is a behavioral change, not a UI change.
4. **Three new tools** (create_bet, edit_block, edit_bet) and risk-level classification -- server-side, no UI surface beyond what review messages already provide.

## Component budget impact

Zero new custom components. Everything composes from existing Tier 2/3 components + DaisyUI primitives. The soul-prompt editor in settings is a plain textarea + save button -- standard form elements, not a new component.
