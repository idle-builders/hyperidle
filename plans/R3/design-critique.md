# R3 Design Critique: Block Rendering in Messages

DESIGN-CRITIQUE: variant=approved score=8/10 rounds=1 axes: H:8 S:8 T:8 C:9 Co:9 St:7 A:8 AS:9 PP:6

---

## Dimension Scores

| Dimension | Score | Notes |
|---|---|---|
| Hierarchy | 8/10 | Clear reading order. Body text recedes (--text-mid), headings use font-heading for structural emphasis, code blocks pop with --surface-2 background. h2-h6 at 13px (same as body) differentiated only by font-family and uppercase may be subtle but acceptable for v1. |
| Spacing | 8/10 | 8px gap between payloads is on-grid (2x 4px). ParagraphPayload uses m-0. CommentRow's existing 6px py is pre-existing and not introduced by R3. |
| Typography | 8/10 | 13px body matches existing messages. Code at 12px monospace. Headings downscaled to 13-14px via child selectors. Line heights within acceptable ranges (1.6 body, 1.2 heading, 1.5 code). |
| Color | 9/10 | All semantic tokens. --text-mid for body, --text-strong for headings/bold, --surface-2 for code, --primary for links. No hardcoded colors. |
| Coherence | 9/10 | Reuses all existing payload renderers without modification. Zero new components. Same renderPayload dispatch as KnowledgeBody. |
| States | 7/10 | Primary, regression, and edge cases covered. No loading/error states needed (synchronous). Empty-payloads branch renders empty paragraph -- acceptable but visual output underdocumented. |
| A11y | 8/10 | Semantic HTML from payload renderers (h1-h6, ul/ol, blockquote, a with rel="noopener noreferrer"). Links keyboard-accessible. No new interactive elements. |
| Anti-slop | 9/10 | No new components, no AI tells. Dense wiring. Rejected alternatives well-reasoned. |
| Premium polish | 6/10 | Explicit v1 non-goals (no syntax highlighting, no copy button, no collapsible sections). Heading child-selector overrides are hardcoded pixels, not density-aware. |

---

## WARNING

**W-1.** Design doc section 3 states ParagraphPayload's `text-[var(--text)]` "resolves to --text-hi (bright white)" and claims the wrapper cascade will be overridden. This is incorrect: `--text` is NOT defined in tokens.css. When var(--text) resolves against an undefined property with no fallback, CSS color becomes `initial` which means `inherit`. ParagraphPayload inherits from the parent, so the wrapper's --text-mid cascades through correctly. The builder must NOT add `[&_p]:text-[var(--text-mid)]` -- it would be dead code.

**W-2.** Heading child-selector approach (`[&_h1]:text-[14px]` etc.) targets HTML elements, not components. If an HTML block survives sanitization and contains an h1, the override applies there too. Acceptable for v1.

**W-3.** Softbreak behavior change is acknowledged but not addressed for historical messages. Existing agent messages with single-newline formatting will collapse after R3. The mitigation "agents use \n\n" is forward-looking only.

## SUGGESTION

**S-1.** Image downgrade (alt text as paragraph) could benefit from a visual marker indicating an image was present but not rendered.

**S-2.** useMemo dependency on `text` alone is correct (sanitizeHtml affects rendering, not parsing) but non-obvious; a comment would help.

## What is working well

- Concept boundary is sharp: messages reuse rendering infrastructure without becoming block hosts. Naming (derivePayloads, not deriveBlocks) makes this visible in code.
- Reusing 10 existing payload renderers without modification guarantees visual consistency with KnowledgeBody and BetPitch.

---

**Verdict: PASS at 8/10.** Design advances. W-1 is the most actionable finding for the builder.
