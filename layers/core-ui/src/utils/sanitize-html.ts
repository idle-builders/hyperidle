// @lore: prose HTML only — not for html-kind artifacts; those run in a sealed frame because sanitising strips their scripts
import DOMPurify from "dompurify";

export const sanitizeHtml = (raw: string): string => DOMPurify.sanitize(raw);
