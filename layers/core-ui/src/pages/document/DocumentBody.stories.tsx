/**
 * DocumentBody stories — renders key states for visual verification.
 *
 * States covered:
 *  - Empty body (no content yet)
 *  - 3-sentence belief (no chrome validation)
 *  - 5-section playbook (heading hierarchy)
 *  - Mixed markdown with inline HTML
 *  - Hostile HTML (XSS attempt — DOMPurify strips)
 */

import { DocumentBody } from "./DocumentBody";

export default { title: "Page: Document/Body" };

export const Empty = (): React.JSX.Element => <DocumentBody body="" hostId="story-empty" />;

export const ThreeSentenceBelief = (): React.JSX.Element => (
	<DocumentBody
		hostId="story-belief"
		body={[
			"JWT-based authentication with refresh tokens. Access tokens expire in 15 minutes.",
			"",
			"Refresh tokens last 7 days; rotation is automatic.",
			"",
			"All tokens are stored in httpOnly cookies, never localStorage.",
		].join("\n")}
	/>
);

export const FiveSectionPlaybook = (): React.JSX.Element => (
	<DocumentBody
		hostId="story-playbook"
		body={[
			"# Onboarding playbook",
			"",
			"Quick reference for new agent provisioning.",
			"",
			"## Provisioning",
			"",
			"Follow the runbook in /docs/runbooks/agent-provision.md.",
			"",
			"## Permissions",
			"",
			"Grant via the role-template, never ad hoc.",
			"",
			"### Edge cases",
			"",
			"Read-only routines need only `routines:run`.",
			"",
			"## Verification",
			"",
			"Confirm with `bun run check` and the smoke test.",
			"",
			"## Rollback",
			"",
			"`git revert` then re-run provisioning.",
		].join("\n")}
	/>
);

export const MixedWithHtml = (): React.JSX.Element => (
	<DocumentBody
		hostId="story-mixed"
		body={[
			"# Mixed content",
			"",
			"A paragraph with **bold** and _italic_ text.",
			"",
			"- Item one",
			"- Item two",
			"",
			"> A blockquote for emphasis.",
			"",
			"<div>A raw HTML div block (sanitised by DOMPurify).</div>",
		].join("\n")}
	/>
);

export const HostileHtml = (): React.JSX.Element => (
	<DocumentBody
		hostId="story-hostile"
		body={[
			"# XSS attempt (DOMPurify neutralised)",
			"",
			"<script>window.__hostile = true;</script>",
			"",
			'<img src="x" onerror="alert(1)">',
			"",
			'<iframe src="https://evil.example"></iframe>',
			"",
			'<a href="javascript:alert(1)">javascript link</a>',
			"",
			"The paragraph above rendered clean — all active payloads stripped.",
		].join("\n")}
	/>
);
