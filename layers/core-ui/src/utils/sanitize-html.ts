// @lore: DOMPurify default profile, not narrowed — agents write <details>/<table>/<br>; tighter allowlist produces "can't be shown" for valid content
// @lore: prose HTML only — not for html-kind artifacts; those run in a sealed frame because sanitising strips their scripts
// @lore: app-side DOMPurify injection — design-system stays framework-agnostic and takes sanitiser as a parameter
import DOMPurify from "dompurify";

export const sanitizeHtml = (raw: string): string => DOMPurify.sanitize(raw);
