/**
 * The one sanitiser policy for agent-authored prose.
 *
 * A knowledge item, a comment and an artifact of the `text` kind are the same
 * class of content — a markdown body an agent wrote — so they get the same
 * treatment. Two policies for one class of content is how they drift apart.
 *
 * @lore AZ6: DOMPurify's default profile, deliberately not narrowed. Agents
 * legitimately write `<details>`, `<table>` and `<br>`; a tighter allowlist turns
 * good content into the "can't be shown" state, which is the defect this work
 * package exists to remove.
 *
 * @lore AZ6: this is for HTML embedded INSIDE a prose body, where the markup is
 * formatting. It is NOT the policy for an artifact of the `html` kind — that kind
 * is a self-contained page and runs whole inside a sealed frame, because
 * sanitising it would strip the scripts that make it worth opening. See
 * `framework/design-system/src/artifact-frame/build-srcdoc.ts`.
 *
 * @lore L23: the design-system package never imports DOMPurify — it stays
 * framework-host-agnostic and takes the sanitiser as a parameter. This module is
 * the app-side injection point.
 */
import DOMPurify from "dompurify";

/** Sanitise agent-authored HTML embedded in a prose body. */
export const sanitizeHtml = (raw: string): string => DOMPurify.sanitize(raw);
