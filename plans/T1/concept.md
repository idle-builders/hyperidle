# T1 Concept Verification

**Concept doc:** `plans/human-authoring/editing-experience-concept.md` (LOCKED)

**Verdict:** Concept doc fully covers T1 scope. No new concept work needed.

T1 does not introduce a new domain concept. BodyEditor is a design-system component (the 20th custom component) that wraps TipTap to provide WYSIWYG editing with GFM markdown as the storage format. The locked concept doc explicitly covers every aspect of T1's scope:

- **TipTap as editor framework** -- concept doc section "Editor Technology: TipTap" (lines 104-128) provides the selection rationale, comparison matrix, and justification for TipTap over BlockNote/Novel/Slate.
- **BodyEditor component shape** -- concept doc section "The Editor Component" (lines 222-249) defines the `BodyEditorProps` interface with `variant: "full" | "mini"`, `initialContent`, `onChange`, `placeholder`, `autoFocus`, `minHeight`, `editable`.
- **Slash menu with 8 block types** -- concept doc section "Slash Menu" (lines 253-266) lists all 8 insertable BlockKind types mapping to GFM output.
- **Inline formatting + floating toolbar** -- concept doc sections "Inline Formatting" (lines 270-280) and "Toolbar" (lines 282-285).
- **Keyboard shortcuts** -- concept doc table at lines 270-279: Cmd+B/I/E/K/Shift+X.
- **Markdown round-trip fidelity** -- concept doc governing principle (line 6-9) and AC items 4, 45.
- **Design system placement** -- concept doc line 249: "This is a design-system-level component -- it lives in `packages/design-system/`."
- **Package dependencies** -- concept doc section "Package: @tiptap/ Dependencies" (lines 132-143) lists exact packages.

The concept doc also covers T2-T4 (surface integrations) and block references, which are out of scope for T1. T1 extracts only the self-contained component.
