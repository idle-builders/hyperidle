# AE6 Design Brief

DESIGN-CLASS: routine  ref=ArtifactView+ArtifactPreviewSurface+ArtifactKindBadge  pattern=ArtifactGalleryCard.tsx+ArtifactStackItem.tsx+ArtifactPreview.tsx

## Summary

AE6 reshapes the artifact kind-to-renderer mapping from a closed 13-member business-domain enum to an open 6-kind content-type model. The design question is not "what should the review experience look like?" (those already exist as the 5 ArtifactView shapes) but rather "how do the 6 new kinds map to renderers, what does the fallback look like, and where do labels appear?"

## User task

A founder reviews an artifact produced by an agent. The kind determines the review experience (diff viewer for code, prose reader for text, sandboxed preview for html, etc.). Labels provide business context ("this text artifact is a contract") without changing the renderer. Unregistered kinds show a sensible fallback.

## Interrogation resolutions

1. **Kind-to-renderer mapping is direct.** Each of the 6 kinds maps to exactly one renderer. No secondary dispatch on labels, metadata, or any other field.

2. **Existing ArtifactView shapes cover 5 of 6 kinds.** The `html` kind is the only genuinely new review experience -- it needs a sandboxed iframe. The other 5 map to existing shapes:
   - `text` -> content_preview (renders markdown via Block primitive)
   - `code` -> text_diff (already maps code_diff)
   - `image` -> visual_comparison (already maps screenshot/design)
   - `data` -> data_metrics (already maps dashboard/verification)
   - `url` -> action_summary (already maps running_service)

3. **Labels are metadata, not chrome.** They appear in the ArtifactKindBadge area or the metadata strip -- never as a structural element.

4. **Fallback must be robust.** When an artifact has an unregistered kind, the system renders the kind string + raw preview data in a structured way. Never crashes, never blanks.

5. **Migration is invisible to the user.** Old artifacts with kinds like `contract` or `drafted_email` get migrated to `text` + label. The user sees the same content rendered the same way (or better, since they get the text renderer instead of the fallback).

## Design constraints

- 19 custom component budget: no new design-system components. ArtifactView is shell-tier.
- Kind determines renderer. Labels MUST NOT affect renderer selection.
- Renderers must be lazy-loadable (React.lazy).
- ArtifactKindBadge must accept any string (not just the closed enum).
- The html kind needs CSP/sandbox policy (architecture concern, but design must show the iframe container).
