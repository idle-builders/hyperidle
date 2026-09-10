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
const APPROVED_BORDER_RECEIPT_EXPANSION = { thin: 186, default: 15, strong: 11 } as const; // @lore BA6 search-picker round +1: TaskDependencyField.tsx's rewrite (paste-a-task-id → search-and-pick, per the maintainer's rejection) adds ONE new raw `border-width-thin` site — the search-results dropdown's own wrapper (`role="listbox"`), which has no shared home elsewhere. The chip itself is still `ReferenceChip` (mode="draft"), whose shell site was already counted and stays net 0. // @lore nested-knowledge-items tree-ui +2: KnowledgeTreeList row separator + ChildrenCard child-row top rule (border-width-thin-b / thin-t). // @lore nested-knowledge-items -1: KnowledgeDetail.tsx's dead "Kind" metadata row deleted whole, taking its wrapping div's `border-width-thin-b` with it (AC6 — `kind` is retired vocabulary; see the `small` -2 note below for the matching type-small removal). -1: KnowledgeDetail.tsx's role-change error banner border deleted with the role row (role stops being editable). -2: capture deletion — ExecutingBand + OutcomeBand borders removed; +1: action-rules list border BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BB1 default -2: same merge. -1: ItemList variant="boxed" replaces the two hand-rolled hairline-border wrapper divs in KnowledgeRoleList.tsx and SettingsHarnesses.tsx (-2) with ItemList.tsx's own one shared containerClass branch (+1) — the wrapper's border site now lives once, not per caller. +1: knowledge-attachment-slot — Row.tsx's div+onClick+actions branch now mirrors the li+onClick+actions branch's structure (actions render outside the clickable element, matching the li branch's existing pattern), which duplicates the li branch's own separator-border site into the div branch too — a new raw site, not a moved one. // @lore artifacts-become-knowledge -1: the file-diff chip in ToolPart.tsx stopped being a <button> and became a <span> — it fired an open target of `/artifacts/<file path>`, a path rather than a row id, which never resolved even while that route existed. BA2: the action-rules settings surface is deleted with interception, so its own additions come back off.

const EXPECTED = {
	typography: {
		// Review-canvas fabrication cleanup -5: -2 ReviewActionOperation.tsx ("Refund
		// amount" label deleted; ProposedCallArgsPanel's "Tool" label deleted with the
		// panel — the "Irreversible" label's own site survives, now conditional on
		// `operation.irreversible`); -1 ReviewComposition.tsx (TaskSection's dead
		// betTitle/taskTitle breadcrumb button deleted); -1 ReviewMetricsMoved.tsx (the
		// unconditional "Timing" badge deleted — only the confirmed `needsYou` case
		// renders now); -1 ReviewVisualDiff.tsx (the deleted Field component's own label).
		label: 95, // @lore BA6 search-picker round net 0: TaskDependencyField.tsx no longer uses `Input`'s `label` prop at all — the rewrite (paste-a-task-id → search-and-pick) uses `SearchField`'s `placeholder` instead, which renders no `<label>` element. Same net-zero `label`-profile contribution as the previous cut, for a different reason (nothing to count, not an already-counted site). // rebase-onto-#547: combines two independent strands' deletions off the same 106 base — @lore artifacts-become-knowledge -10 (ArtifactGalleryCard, ArtifactKindBadge, ArtifactPreviewSurface, ArtifactStackItem and the ArtifactSection rewrite's 4×type-label) AND @lore nested-knowledge-items -1 (KnowledgeTopicGroup.tsx's topic-header span, topic grouping died with the `topic` column) — everything else below unchanged from either side. -2: KnowledgeRoleList.tsx's two hand-rolled `type-label uppercase` spans (section label, create label) replaced by the shared SectionLabel component — SectionLabel's own site is already counted, so calling it twice more adds no new raw sites. +2: SettingsSkillsAndRules.tsx's "Registered skills and rules" and "Create a skill or rule" section labels. -2: the two "Model tier" field labels (AgentAddDialog + AgentDetailPane), gone with the tier dial — people pick a model per agent now. BA9f +1: AgentDetailPane's IDENTITY section heading (the SYSTEM PROMPT heading it replaces was the same profile, and AgentEditor gained an "Identity" label above the document link). -1: read-mode ConversationHeader strip removed (was FR-3 +1); +1: BA1 review N7 RoutineDetailPane "Event" field label (event routines show an Event select instead of Schedule); +1: BA9a SettingsPlugins contribution key label; +1: BA9d D11 RoutineDetailPane "Transition to" edit-mode label; -2: capture deletion — ExecutingBand "Executing…" + OutcomeBand "Executed"/"Execution failed" labels removed; +2: action-rules list header + add-rule header; BB1 -4: WorkBet.tsx, WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task (WorkTaskPage adds the single recursive surface back, so -4 is the net); BB1 -2: ArtifactThreadsSummary, useArtifactThreadSummary and KnowledgeCreateDialog deleted — orphaned when the bet page went BA2: the action-rules settings surface is deleted with interception, so its own additions come back off.
		// Review-canvas fabrication cleanup -10: -2 ReviewCodeDiff.tsx ("All checks
		// passed" pill + the "coverage" label deleted from CiRow); -5
		// ReviewComposition.tsx (CheckoutCard's fixed/the-bug pill, "Promo code" label,
		// and both expired/no-feedback captions, all deleted with the checkout mock);
		// -1 ReviewFieldChangeSet.tsx (the unchanged-fields disclosure's five
		// hardcoded field names deleted); -2 ReviewVisualDiff.tsx net (the deleted
		// MockScreen hero caption + the deleted Field's placeholder-box mark, offset
		// by the honest-absence pane's own "No rendered image supplied" caption).
		metadata: 209, // @lore BA6 fix-round net 0: TaskDependencyField.tsx's dependency-chip id text no longer has its own hand-rolled `type-metadata` span — it renders through `ReferenceChip`'s existing `type-metadata` shell, an already-counted site. // @lore nested-knowledge-items tree-ui +3: KnowledgeTreeList private badge + timestamp + empty-children copy (type-metadata); replaces the retired └ dent marker site. // @lore nested-knowledge-items AC2 +1: MoveDialog.tsx's error paragraph — the same `type-metadata text-error` alert ScopeChangeDialog already uses for a refused PATCH, now a second real site since Move is its own dialog rather than a branch of ScopeChangeDialog. // @lore nested-knowledge-items AC1 +1: KnowledgeList.tsx's new tree-indent marker span (the "└" prefix on a nested Curated-tab row, `type-metadata`) — the review's own "no indentation, no nesting affordance anywhere" finding closed. // rebase-onto-#547: combines two independent strands' deletions off the same 213 base -- @lore artifacts-become-knowledge -6 (ArtifactSection/ArtifactEmbed deleted, ArtifactSection rewrite's 1x type-metadata) AND @lore nested-knowledge-items -3 (KnowledgeTopicGroup.tsx's item-count span, and the kind-badge type-metadata span duplicated in both KnowledgeList.tsx views -- kind vocabulary deleted, so the badge that rendered it is gone from both Triage and Curated rows) -- everything else here unchanged from either side.
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
		small: 205, // @lore BA6 label-order fix-round +1: TaskDependencyField.tsx now owns its
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
		control: 87, // @lore nested-knowledge-items tree-ui +1: KnowledgeTreeList title uses type-control (same profile as Row titles). // rebase-onto-#547: combines two independent strands' deltas off the same 87 base -- @lore artifacts-become-knowledge -2 (ArtifactSection rewrite's type-control view-all/filter button, and the file-diff chip losing its control site when it stopped being a button) AND @lore nested-knowledge-items +1 (KnowledgeDetail.tsx's new ChildrenCard renders one type-control link per child -- "a parent renders its children" -- a new authored site, same profile the Backlinks card's own item links already use) -- everything else here unchanged from either side.
		input: 11, // +1: AgentEditor model-option select (a harness's declared select for the chosen model)
		"avatar-initial": 11, // BB1 -3: BetCard and the bet pages deleted when bets and tasks merged into one recursive task
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
		data: 65, // @lore artifacts-become-knowledge: -14 — ArtifactDetailPane, ArtifactGalleryCard, ArtifactEmbed, ArtifactSection, ArtifactKindBadge deleted // -1: SettingsSkillsAndRules.tsx's row title span is gone — the row now renders through Row.tsx (ds), whose title span is `type-small`, an already-counted, unchanged site. Historical +1: SettingsSkillsAndRules.tsx's row title span. BA9f -1: AgentProfile's <pre> persona dump deleted — the profile links to the identity document instead of reprinting it. // -5: FR-20 hint bar + FR-21 restyle; -3: deletion pass removed ArtifactEmbed.tsx; -2: capture deletion — OutcomeBand receipt + error type-data paragraphs removed; +1: action-rules rule pattern span BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net BA2: the action-rules settings surface is deleted with interception, so its own additions come back off.
		"inline-code": 2,
	},
	// Follow-up review fixes -1: ReviewMetricsMoved.tsx — the deleted trivia
	// toggle button was the sole `motion-feedback` site removed with it.
	motion: { feedback: 8, move: 14, spring: 2, enter: 1, activity: 7, loading: 6, busy: 1 }, // @lore nested-knowledge-items tree-ui +1: KnowledgeTreeList chevron uses motion-move for expand/collapse rotation. // @lore artifacts-become-knowledge: move -2 — ArtifactDetailPane, ArtifactSection deleted // busy -1: capture deletion — ExecutingBand spinner removed BB1 -1: WorkBet.tsx (1422 lines), WorkBetCreate, BetCard and their stories deleted when bets and tasks merged into one recursive task; WorkTaskPage adds the single recursive surface back, so this is the net
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
