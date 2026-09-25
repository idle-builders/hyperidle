#!/usr/bin/env tsx
import {
	collectDesignProfileCensus,
	findLiveBorderCountMismatches,
} from "./lib/design-profile-census.js";
import { discoverDesignSources } from "./lib/design-source-discovery.js";

// Immutable audit receipts count pre-migration authored sites, not final source
// declarations. Shared class construction (including the upstream PageHeader
// pane consolidation) combines equivalent sites, so the approved receipt
// expansion is the measured final source-profile population.
// Deletion pass: -1 thin, from select-diff.tsx.
// +1 BA9a: SettingsPlugins contribution list left border.
// Review-canvas fabrication cleanup -13 thin, all from deleting fabricated content:
// -3 ReviewActionOperation.tsx (ProposedCallArgsPanel's outer section + header border,
//   plus its `var(--bw-thin)` inline separator style — the panel itself is deleted as
//   test-only-reachable, since `proposedCall` is never populated in production);
// -1 ReviewBatch.tsx net (the "no reply drafted" dashed box deleted; the impact-metric
//   band's border site survives, just moved inside its new `batch.metric ?` guard);
// -1 ReviewCodeDiff.tsx (the trivia expanded-file-list disclosure deleted along with
//   its three hardcoded filenames);
// -5 ReviewComposition.tsx (CheckoutCard's figure + figcaption borders, its two
//   subtotal/total row rules, and the dead "Comment on this" button's border — the
//   whole SPRING24/$120 fake checkout card and one no-op control);
// -3 ReviewVisualDiff.tsx (the deleted MockScreen's hero-band border, the deleted
//   Field component's border, the deleted Thumb component's border — the fake signup
//   screen and its L1 thumbnails).
// Review fix-round -1: ReviewRenderedInContext.tsx — the send-plan/exclusions
//   container's `var(--bw-thin)` inline border, deleted with the five dead
//   fields (`audienceLabel`/`excludedNote`/`sendPlan`/`ctaLabel`/`footer`)
//   `mapRenderedPayload` hardcoded to "" unconditionally.
// thin +2: knowledge document Role row (metadata row rule + error banner).
// @lore artifacts-become-knowledge: -6 thin — the artifact RENDER family is deleted with the
// artifacts table: ArtifactGalleryCard, ArtifactKindBadge, ArtifactPreview,
// ArtifactPreviewSurface, ArtifactStackItem, ArtifactTimestamp, compose-artifact-body and
// artifact-unrenderable. ArtifactSection SURVIVES (repointed at parented knowledge items,
// keeping the word users see), and ArtifactEmbed was already gone before this change.
// @lore BC1 -8 thin, all dead/duplicate verdict controls: -1 ConversationSurface.tsx
// (InsertMenu's popover border, the whole inert "+" compose menu deleted); -1
// SessionView.tsx (SessionComposer's dead "Insert" no-op attachment button); -1
// ReviewActionOperation.tsx (its own local Approve/Reject footer — the review
// frame already owns the verdict gate, so this was a duplicate); -2
// ReviewBrowserPreview.tsx (the reload no-op's border + its own local
// Approve/Request-changes footer); -1 ReviewFieldChangeSet.tsx (the per-field
// select-to-approve footer's top rule); -2 ReviewRenderedInContext.tsx (its own
// local Approve send/Request-changes footer, same duplicate-gate reason).
const APPROVED_BORDER_RECEIPT_EXPANSION = { thin: 173, default: 16, strong: 11 } as const; // @lore Agent behaviour page deleted (the plugin configuration engine went with it): -2 thin, SettingsAgentBehavior.tsx's own row and editor borders. // // @lore BC5 T9: -8 label, -8 metadata, -1 small, -1 avatar-initial, +1 border-thin. WorkRoutine.tsx, work/RoutineDetailPane.tsx, work/RoutineCreateDialog.tsx and their stories are deleted whole (subscriptions replace routines) — their SectionLabel/Select/Input field labels, run-history metadata rows, empty-state copy and agent-initial avatar chip go with them. AgentProfile.tsx's CapabilityBadge and VerdictDot (Harness Capabilities / Review Track Record sections) are deleted — no `open_user` equivalent, the route that served them is itself retired in this item's tree. WorkTeam.tsx's "— Lead" marker span is deleted with the lead concept (team is id + name now). Net +1 border-thin: SubscriptionsSection.tsx's new add-form wrapper box, a raw site with no shared home. Verified via `npm run lint:design-profiles`. @lore BC3 review-fix +1 thin: ReviewPage.tsx's new verdict-refused alert (shown above ReviewComposition when a verdict submission is rejected) is a `role="alert"` div styled with `border-width-thin-b`, the same inline alert profile `ds/Composer.tsx` uses for its own send failures — a new raw site, no shared home. // @lore BC3 -4 thin: SessionActivityPanel.tsx deleted whole (session dial-in becomes a hosted thread) — its own aside left border, header bottom rule, filter-tabs bottom rule, and ended-summary top rule, all border-width-thin variants, gone with the panel. // @lore BA6 Combobox generalization round -1: TaskDependencyField.tsx's hand-rolled results-listbox wrapper (the prior round's +1 raw `border-width-thin` site) is deleted along with the hand-rolled list itself — the field is rebuilt on the shared `ds/Combobox.tsx` (generalized from `RoleCombobox`), whose own popover `border-width-thin` site is reused, not duplicated. `SearchField.tsx` is reverted to its pre-BA6 shape (no longer a caller), taking its extra wrapper div — and the border site on it — with it. Net -1 vs. the prior round's 186. Verified via `npm run lint:design-profiles`. // @lore BA6 search-picker round +1: TaskDependencyField.tsx's rewrite (paste-a-task-id → search-and-pick, per the maintainer's rejection) adds ONE new raw `border-width-thin` site — the search-results dropdown's own wrapper (`role="listbox"`), which has no shared home elsewhere. The chip itself is still `ReferenceChip` (mode="draft"), whose shell site was already counted and stays net 0. // @lore nested-knowledge-items tree-ui +2: KnowledgeTreeList row separator + ChildrenCard child-row top rule (border-width-thin-b / thin-t). // @lore nested-knowledge-items -1: KnowledgeDetail.tsx's dead "Kind" metadata row deleted whole, taking its wrapping div's `border-width-thin-b` with it (AC6 — `kind` is retired vocabulary; see the `small` -2 note below for the matching type-small removal). -1: KnowledgeDetail.tsx's role-change error banner border deleted with the role row (role stops being editable). -2: capture deletion — ExecutingBand + OutcomeBand borders removed; +1: action-rules list border BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BB1 default -2: same merge. -1: ItemList variant="boxed" replaces the two hand-rolled hairline-border wrapper divs in KnowledgeRoleList.tsx and SettingsHarnesses.tsx (-2) with ItemList.tsx's own one shared containerClass branch (+1) — the wrapper's border site now lives once, not per caller. +1: knowledge-attachment-slot — Row.tsx's div+onClick+actions branch now mirrors the li+onClick+actions branch's structure (actions render outside the clickable element, matching the li branch's existing pattern), which duplicates the li branch's own separator-border site into the div branch too — a new raw site, not a moved one. // @lore artifacts-become-knowledge -1: the file-diff chip in ToolPart.tsx stopped being a <button> and became a <span> — it fired an open target of `/artifacts/<file path>`, a path rather than a row id, which never resolved even while that route existed. BA2: the action-rules settings surface is deleted with interception, so its own additions come back off. @lore BC4 net +1 default: DocumentList.tsx's new "Memories" filter-chip toggle button carries `border-width-default` (the same new site that added the +1 control above) with no equivalent in the deleted KnowledgeList.tsx.

const EXPECTED = {
	typography: {
		// Review-canvas fabrication cleanup -5: -2 ReviewActionOperation.tsx ("Refund
		// amount" label deleted; ProposedCallArgsPanel's "Tool" label deleted with the
		// panel — the "Irreversible" label's own site survives, now conditional on
		// `operation.irreversible`); -1 ReviewComposition.tsx (TaskSection's dead
		// betTitle/taskTitle breadcrumb button deleted); -1 ReviewMetricsMoved.tsx (the
		// unconditional "Timing" badge deleted — only the confirmed `needsYou` case
		// renders now); -1 ReviewVisualDiff.tsx (the deleted Field component's own label).
		label: 82, // @lore Agent behaviour page deleted (the plugin configuration engine went with it): -2, SettingsAgentBehavior.tsx's own label sites. // @lore BC3 -2: SessionActivityPanel.tsx deleted whole (session dial-in becomes a hosted thread) — its own "Live" pill label and "Ended" status label, both type-label, gone with it. // @lore BA6 picker-migration round -1: RecipientPicker.tsx's hand-rolled "Live" pill (`type-label uppercase`) is deleted with the hand-built listbox rows — the shared `Combobox` has no icon/badge slot, so the live indicator folds into the row's plain-text description instead. // @lore BA6 search-picker round net 0: TaskDependencyField.tsx no longer uses `Input`'s `label` prop at all — the rewrite (paste-a-task-id → search-and-pick) uses `SearchField`'s `placeholder` instead, which renders no `<label>` element. Same net-zero `label`-profile contribution as the previous cut, for a different reason (nothing to count, not an already-counted site). // rebase-onto-#547: combines two independent strands' deletions off the same 106 base — @lore artifacts-become-knowledge -10 (ArtifactGalleryCard, ArtifactKindBadge, ArtifactPreviewSurface, ArtifactStackItem and the ArtifactSection rewrite's 4×type-label) AND @lore nested-knowledge-items -1 (KnowledgeTopicGroup.tsx's topic-header span, topic grouping died with the `topic` column) — everything else below unchanged from either side. -2: KnowledgeRoleList.tsx's two hand-rolled `type-label uppercase` spans (section label, create label) replaced by the shared SectionLabel component — SectionLabel's own site is already counted, so calling it twice more adds no new raw sites. +2: SettingsSkillsAndRules.tsx's "Registered skills and rules" and "Create a skill or rule" section labels. -2: the two "Model tier" field labels (AgentAddDialog + AgentDetailPane), gone with the tier dial — people pick a model per agent now. BA9f +1: AgentDetailPane's IDENTITY section heading (the SYSTEM PROMPT heading it replaces was the same profile, and AgentEditor gained an "Identity" label above the document link). -1: read-mode ConversationHeader strip removed (was FR-3 +1); +1: BA1 review N7 RoutineDetailPane "Event" field label (event routines show an Event select instead of Schedule); +1: BA9a SettingsPlugins contribution key label; +1: BA9d D11 RoutineDetailPane "Transition to" edit-mode label; -2: capture deletion — ExecutingBand "Executing…" + OutcomeBand "Executed"/"Execution failed" labels removed; +2: action-rules list header + add-rule header; BB1 -4: WorkBet.tsx, WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task (WorkTaskPage adds the single recursive surface back, so -4 is the net); BB1 -2: ArtifactThreadsSummary, useArtifactThreadSummary and KnowledgeCreateDialog deleted — orphaned when the bet page went BA2: the action-rules settings surface is deleted with interception, so its own additions come back off.
		// Review-canvas fabrication cleanup -10: -2 ReviewCodeDiff.tsx ("All checks
		// passed" pill + the "coverage" label deleted from CiRow); -5
		// ReviewComposition.tsx (CheckoutCard's fixed/the-bug pill, "Promo code" label,
		// and both expired/no-feedback captions, all deleted with the checkout mock);
		// -1 ReviewFieldChangeSet.tsx (the unchanged-fields disclosure's five
		// hardcoded field names deleted); -2 ReviewVisualDiff.tsx net (the deleted
		// MockScreen hero caption + the deleted Field's placeholder-box mark, offset
		// by the honest-absence pane's own "No rendered image supplied" caption).
		// @lore BC1 -3: -1 ConversationSurface.tsx (InsertMenu's per-item hint span,
		// deleted with the whole inert "+" compose menu); -1 ReviewBrowserPreview.tsx
		// (the "unsafe source link" fallback span in its own now-deleted local
		// verdict-adjacent link row); -1 ReviewFieldChangeSet.tsx (the deleted
		// approve-rollup footer's "N of M fields approved" count span).
		// @lore the architecture doc +1: WorkTaskPage.tsx's EditPanel gains a
		// `type-metadata` "task-invariant-error" span — the client-side
		// `taskInvariants` check's message, shown when a doomed edit greys the
		// Save button, styled the same as the adjacent "task-save-error" site.
		// Net -3+1 off the 207 base = 205.
		metadata: 190, // @lore Agent behaviour page deleted (the plugin configuration engine went with it): -2, SettingsAgentBehavior.tsx's own metadata sites. // @lore desktop-credential-bridge-shrink +1: SettingsWorker.tsx's shared-backend-key field gains a `type-metadata` result paragraph (the {stored, warning} outcome of credentials.set) — a new raw site, no shared home. // @lore server_credentials deletion -1: CredentialsTab.tsx deleted whole (the server-side credential surface is gone) — its own save-error `type-metadata` paragraph goes with it. // @lore BC3 review-fix +1: ReviewPage.tsx's new verdict-refused alert (shown above ReviewComposition when a verdict submission is rejected) is a `type-metadata` `role="alert"` div — a new raw site, no shared home. // @lore BC3 -6: SessionActivityPanel.tsx deleted whole (session dial-in becomes a hosted thread) — its own tool-args summary, reasoning excerpt, task-title breadcrumb, connecting/error status panes, and ended-summary footer, all type-metadata, gone with it. // @lore combobox-a11y-fix -1: RoutineCreateDialog.tsx's agent-picker field deletes its hand-rolled `type-metadata` "Agent (required)" label span — the field is now named via the shared `Combobox`'s own `label` prop, whose `type-label` site (in Combobox.tsx) is already counted under the `label` family, not a new site here. // @lore BA6 picker-migration round -1: RecipientPicker.tsx's `type-metadata` wrapper around each row's `Tag` (role) is deleted with the hand-built listbox rows — the role now renders as plain text in the Combobox option's description. // @lore BA6 fix-round net 0: TaskDependencyField.tsx's dependency-chip id text no longer has its own hand-rolled `type-metadata` span — it renders through `ReferenceChip`'s existing `type-metadata` shell, an already-counted site. // @lore nested-knowledge-items tree-ui +3: KnowledgeTreeList private badge + timestamp + empty-children copy (type-metadata); replaces the retired └ dent marker site. // @lore nested-knowledge-items AC2 +1: MoveDialog.tsx's error paragraph — the same `type-metadata text-error` alert ScopeChangeDialog already uses for a refused PATCH, now a second real site since Move is its own dialog rather than a branch of ScopeChangeDialog. // @lore nested-knowledge-items AC1 +1: KnowledgeList.tsx's new tree-indent marker span (the "└" prefix on a nested Curated-tab row, `type-metadata`) — the review's own "no indentation, no nesting affordance anywhere" finding closed. // rebase-onto-#547: combines two independent strands' deletions off the same 213 base -- @lore artifacts-become-knowledge -6 (ArtifactSection/ArtifactEmbed deleted, ArtifactSection rewrite's 1x type-metadata) AND @lore nested-knowledge-items -3 (KnowledgeTopicGroup.tsx's item-count span, and the kind-badge type-metadata span duplicated in both KnowledgeList.tsx views -- kind vocabulary deleted, so the badge that rendered it is gone from both Triage and Curated rows) -- everything else here unchanged from either side.
		// Review-canvas fabrication cleanup -8: -1 ReviewActionOperation.tsx
		// (ProposedCallArgsPanel's arg-key `dt` deleted with the panel); -1
		// ReviewBatch.tsx net (the "no reply drafted" dashed box's caption deleted;
		// the impact-metric line's own site survives inside its new guard); -2
		// ReviewComposition.tsx (CheckoutCard's "Total" label + value); -3
		// ReviewMetricsMoved.tsx net (the deleted "ties to bank" span and the deleted
		// L1 narrative paragraph's three spans, offset by the conditional "ties" span
		// + the rebuilt per-figure current/prior line); -1 ReviewVisualDiff.tsx (the
		// deleted "Create account" CTA span).
		// Review fix-round net -2: -2 ReviewRenderedInContext.tsx (audienceLabel's
		//   separator "·" span + its own label span, both dead — the field is
		//   hardcoded to "" unconditionally, never a real optional case) + -1
		//   ReviewRenderedInContext.tsx (excludedNote's span, same reason), offset by
		//   +1 ReviewFieldChangeSet.tsx (the unchanged-fields row now uses
		//   `type-metadata` instead of a stray `type-control` left from when the row
		//   was a disclosure button).
		// @lore BC1 -2: ConversationSurface.tsx's InsertMenu — each menu row's text
		// wrapper span and its label span, both deleted with the whole inert "+"
		// compose menu.
		small: 194, // @lore Agent behaviour page deleted (the plugin configuration engine went with it): -2, SettingsAgentBehavior.tsx's own small sites. // @lore server_credentials deletion -2: CredentialsTab.tsx deleted whole — its own missing-secret warning span and load-error paragraph, both `type-small`, gone with it. // @lore BC3 net +1: SessionActivityPanel.tsx deleted whole (-1, its own agent-name span); AssistantOverlay.tsx's rewritten thread lookup adds two new type-small empty/error states ("Couldn't find your assistant agent." and "Say something to start.") (+2). // @lore BA6 picker-migration round -3: RecipientPicker.tsx's hand-built listbox rows are deleted with the migration to the shared `Combobox` — the "Loading..." row, the "No recipients found" row, and the per-row recipient-name span (all `type-small`) go with it; `Combobox`'s own loading/empty rows and option labels are already-counted sites, not new ones. // @lore BA6 Combobox generalization round -1: TaskDependencyField.tsx's hand-rolled // @lore BC4 net -1: DocumentDetail.tsx replacing KnowledgeDetail.tsx whole (the rename wave's page rewrite) drops one type-small site along with the fixture-fallback paths (LEGACY_* blocks) the old page carried — 14 sites become 13; the survivors are unchanged in kind, just re-pointed onto real document data. // @lore BC5 T11 +1: AgentProfile.tsx's restored Review Track Record section adds one new type-small site — the per-verdict recent-history list item (decision + date). Harness Capabilities restores with the shared Tag component only, no new raw site.
		// results dropdown is deleted whole (four raw `type-small` sites: the "Searching…" row, the
		// error row, the "No matching tasks" row, and the per-result option button — all counted in the
		// prior round below), replaced by the shared `ds/Combobox.tsx` (generalized from `RoleCombobox`,
		// which already had its own option/custom-value `type-small` sites, unchanged). `Combobox.tsx`
		// does add its own loading/error/empty status rows as new raw `type-small` sites, and
		// `SearchField.tsx`'s `label` prop (and its lone `type-small` site) reverts to gone-for-good, its
		// sole caller no longer using it. Net -1 vs. the prior round's 204. Verified via
		// `npm run lint:design-profiles`.
		// @lore BA6 cleanup round -1: SearchField.tsx's `label` prop deleted (test-only-reachable —
		// its sole caller, TaskDependencyField, moved to owning its own label and passing SearchField
		// only an `id`; the only other consumer was the WithLabel story, deleted with it), taking its
		// `type-small` `<label>` site with it. Net against the fix-round +1 immediately below.
		// @lore BA6 label-order fix-round +1: TaskDependencyField.tsx now owns its
		// own visible label (same `type-small text-primary` profile SearchField used to render
		// for it) so it can sit before the chip list instead of between chips and input;
		// SearchField's own `label`-prop site is unchanged (still there for other future
		// callers) so this is a genuine new site, not a moved one.
		// @lore BA6 fix-round +1: SearchField.tsx gained a `label` prop (mirroring `Input`'s), rendered as one new `type-small` site — restoring the "Depends on (waits until these finish)" label the search-picker rewrite had dropped entirely. // @lore BA6 search-picker round +4: TaskDependencyField.tsx's rewrite adds four new raw `type-small` sites, all inside the new search-results dropdown with no shared home — the "Searching…" loading row, the error row, the "No matching tasks" empty row, and the per-result option button. // @lore nested-knowledge-items -2: KnowledgeDetail.tsx's dead "Kind" metadata row deleted whole — its wrapping div (`type-small border-width-thin-b`, also -1 thin below) and its value span (`type-small`), both gone with the retired `kind` vocabulary (AC6); against real API data this row always read "Kind —". // rebase-onto-#547: combines two independent strands' deletions off the same 204 base -- @lore artifacts-become-knowledge -3 (ArtifactDetailPane, ArtifactSection, ArtifactGalleryCard deleted, offset by ArtifactSection rewrite +1 ArtifactDetailPane body pre element, net -2) AND @lore nested-knowledge-items -1 (KnowledgeDetail.tsx's amendableBanner type-small alert-info deleted -- its trigger, status === "needs_human", is a retired status value with no direct replacement) -- everything else here unchanged from either side.
		// Review fix-round -1: ReviewRenderedInContext.tsx — the sendPlan value
		//   span, dead along with the field it displayed.
		copy: 43, // @lore artifacts-become-knowledge: -2 — ArtifactDetailPane, ArtifactSection deleted
		// Review-canvas fabrication cleanup -2: ReviewComposition.tsx — TaskSection's
		// dead breadcrumb button and ExaminePane's dead "Comment on this" button, both
		// `onClick={() => {}}` no-ops, deleted outright.
		// Follow-up review fixes -1: ReviewMetricsMoved.tsx — the trivia
		// "Show/Hide N items" toggle deleted outright (`MetricsMovedPayload` has no
		// trivia concept at all, so the toggle disclosed nothing real).
		// Review fix-round -1: ReviewFieldChangeSet.tsx — the unchanged-fields row's
		//   `type-control` class removed (it is a static count, not a control).
		// @lore BC1 -9, all dead/duplicate verdict controls: -2 ReviewActionOperation.tsx
		// (its own local Reject/Approve footer buttons — the review frame already
		// owns the verdict gate); -4 ReviewBrowserPreview.tsx (the reload no-op, the
		// "Open in new tab" link, and its own local Approve/Request-changes footer
		// buttons); -1 ReviewFieldChangeSet.tsx (the deleted approve-rollup footer's
		// "Approve all fields" button); -2 ReviewRenderedInContext.tsx (its own local
		// Approve send/Request-changes footer buttons, same duplicate-gate reason).
		control: 79, // @lore Agent behaviour page deleted (the plugin configuration engine went with it): -1, SettingsAgentBehavior.tsx's own control site. // @lore BC3 +1: Conversations.tsx's new ThreadTaskLinks reuses the existing type-control link profile for its per-task title link. // @lore nested-knowledge-items tree-ui +1: KnowledgeTreeList title uses type-control (same profile as Row titles). // rebase-onto-#547: combines two independent strands' deltas off the same 87 base -- @lore artifacts-become-knowledge -2 (ArtifactSection rewrite's type-control view-all/filter button, and the file-diff chip losing its control site when it stopped being a button) AND @lore nested-knowledge-items +1 (KnowledgeDetail.tsx's new ChildrenCard renders one type-control link per child -- "a parent renders its children" -- a new authored site, same profile the Backlinks card's own item links already use) -- everything else here unchanged from either side. // @lore BC4 net +1: DocumentList.tsx's new "Memories" filter-chip toggle button (aria-pressed, filters the Curated tab to memory-slot documents) is a new type-control site with no equivalent in the deleted KnowledgeList.tsx.
		input: 11, // +1: AgentEditor model-option select (a harness's declared select for the chosen model)
		"avatar-initial": 10, // BB1 -3: BetCard and the bet pages deleted when bets and tasks merged into one recursive task
		subheading: 9,
		// Review-canvas fabrication cleanup -1: ReviewVisualDiff.tsx — the deleted
		// MockScreen's "Create your account" hero headline.
		lead: 7, // BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net
		title: 11, // @lore artifacts-become-knowledge: -1 — ArtifactDetailPane deleted // ArtifactSection rewrite +1: ArtifactDetailPane title h2 element.
		display: 3,
		metric: 5, // -1: AZ-bugs-ui-c removed metric span from WorkBet
		// Review-canvas fabrication cleanup -6: -2 ReviewActionOperation.tsx
		// (ProposedCallArgsPanel's "Tool" value + arg-value `dd`, deleted with the
		// panel); -2 ReviewCodeDiff.tsx (the hardcoded "+0.4%" coverage figure + the
		// trivia expanded-file-list wrapper, both deleted); -2 ReviewComposition.tsx
		// (CheckoutCard's promo-code input value + its subtotal/total container).
		// @lore BC1 -1: BlockHandle.tsx deleted whole (dead — no live caller); its
		// thread-count badge span was the file's only `type-data` site.
		data: 60, // @lore server_credentials deletion -1: CredentialsTab.tsx deleted whole — its own `HYPERIDLE_CREDENTIAL_KEY` inline `type-data` `<code>` span goes with it. // @lore BC3 -3: SessionActivityPanel.tsx deleted whole (session dial-in becomes a hosted thread) — its own tool-name span and two activity-time timestamps, all type-data, gone with it. // @lore artifacts-become-knowledge: -14 — ArtifactDetailPane, ArtifactGalleryCard, ArtifactEmbed, ArtifactSection, ArtifactKindBadge deleted // -1: SettingsSkillsAndRules.tsx's row title span is gone — the row now renders through Row.tsx (ds), whose title span is `type-small`, an already-counted, unchanged site. Historical +1: SettingsSkillsAndRules.tsx's row title span. BA9f -1: AgentProfile's <pre> persona dump deleted — the profile links to the identity document instead of reprinting it. // -5: FR-20 hint bar + FR-21 restyle; -3: deletion pass removed ArtifactEmbed.tsx; -2: capture deletion — OutcomeBand receipt + error type-data paragraphs removed; +1: action-rules rule pattern span BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BA2: the action-rules settings surface is deleted with interception, so its own additions come back off.
		"inline-code": 2,
	},
	// Follow-up review fixes -1: ReviewMetricsMoved.tsx — the deleted trivia
	// toggle button was the sole `motion-feedback` site removed with it.
	// @lore BC1: feedback -2, ReviewActionOperation.tsx's own local Reject/Approve
	// footer buttons — the review frame already owns the verdict gate, so this was
	// a duplicate. move -1, BlockHandle.tsx deleted whole (dead — no live caller);
	// its chevron rotation was the file's only `motion-move` site.
	motion: { feedback: 6, move: 13, spring: 2, enter: 1, activity: 4, loading: 6, busy: 1 }, // @lore BC3 -2: SessionActivityPanel.tsx deleted whole (-1, its own "Live" pill dot) and Conversations.tsx's dial-in branch deleted along with it (-1, the dial-in button's own live dot) — both motion-activity sites, session dial-in becomes a hosted thread. // @lore BA6 picker-migration round -1: RecipientPicker.tsx's "Live" pill's `motion-activity` dot is deleted with the hand-built listbox rows. // @lore nested-knowledge-items tree-ui +1: KnowledgeTreeList chevron uses motion-move for expand/collapse rotation. // @lore artifacts-become-knowledge: move -2 — ArtifactDetailPane, ArtifactSection deleted // busy -1: capture deletion — ExecutingBand spinner removed BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net
	border: APPROVED_BORDER_RECEIPT_EXPANSION,
} as const;

const root = process.cwd();
const discovered = discoverDesignSources(
	root,
	new Set([".ts", ".tsx", ".css"]),
	new Set(["@hyperidle/core-ui", "@hyperidle/design-system"]),
);
if (discovered.discoveredPackages.length === 0 || discovered.files.length === 0) {
	throw new Error("design-profile-census: dynamic package/source discovery matched zero files");
}
const census = collectDesignProfileCensus(discovered.files);
const output = {
	schemaVersion: 1,
	discoveredPackages: discovered.discoveredPackages,
	scannedFiles: discovered.files.map((file) => file.path),
	...census,
};
const failures: string[] = [];
for (const group of ["typography", "motion"] as const) {
	for (const [profile, expected] of Object.entries(EXPECTED[group])) {
		const actual = census.profiles[group][profile as keyof (typeof census.profiles)[typeof group]];
		if (actual !== expected)
			failures.push(`${group}.${profile}: expected ${expected}, found ${actual}`);
	}
}
failures.push(
	...findLiveBorderCountMismatches(census.profiles.border, APPROVED_BORDER_RECEIPT_EXPANSION),
);
for (const [family, count] of Object.entries(census.rawByFamily)) {
	if (count !== 0) failures.push(`rawByFamily.${family}: expected 0, found ${count}`);
}
for (const site of census.invalidProfileSites)
	failures.push(`${site.path}:${site.locator} ${site.reason}`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (failures.length > 0) {
	process.stderr.write(`${failures.join("\n")}\n`);
	process.exitCode = 1;
}
