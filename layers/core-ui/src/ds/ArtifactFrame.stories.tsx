// AZ6: ArtifactFrame stories — an artifact of the `html` kind running as its own
// document. Each story below is a real single-file page: its own styles, its own
// script, interactive. Nothing here is sanitised; the frame is what makes that safe.

import { ArtifactFrame } from "./ArtifactFrame.js";

export default {
	title: "ArtifactFrame",
	tier: "2" as const,
};

const DASHBOARD = `
<style>
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #2a2415; background: #faf6ea; padding: 24px }
  h1 { font-size: 20px; margin: 0 0 4px }
  p  { margin: 0 0 20px; color: #645c46 }
  .row { display: flex; gap: 12px }
  .tile { flex: 1; background: #fff; border: 1px solid #e7e0cc; border-radius: 10px; padding: 16px }
  .n { font-size: 26px; font-weight: 700 }
  .l { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #938b70 }
  button { margin-top: 20px; font: inherit; padding: 8px 14px; border-radius: 999px;
           border: 1px solid #e7e0cc; background: #fff; cursor: pointer }
</style>
<h1>Signups</h1>
<p id="sub">Week 3, by plan.</p>
<div class="row">
  <div class="tile"><div class="l">Free</div><div class="n" id="free">402</div></div>
  <div class="tile"><div class="l">Pro</div><div class="n" id="pro">61</div></div>
  <div class="tile"><div class="l">Churn</div><div class="n">4.1%</div></div>
</div>
<button id="go">Project next week</button>
<script>
  document.getElementById("go").addEventListener("click", function () {
    document.getElementById("free").textContent = "489";
    document.getElementById("pro").textContent = "78";
    document.getElementById("sub").textContent = "Week 4, projected.";
    this.textContent = "Projected";
  });
</script>`;

const SHORT = `
<style>body{margin:0;font:14px/1.6 system-ui,sans-serif;padding:20px;color:#2a2415}</style>
<h2 style="margin:0 0 6px">Deploy checklist</h2>
<ol><li>Migrate</li><li>Warm the cache</li><li>Flip the flag</li></ol>`;

const CANVAS = `
<style>body{margin:0;background:#12120c}canvas{display:block}</style>
<canvas id="c" width="640" height="260"></canvas>
<script>
  var x = document.getElementById("c").getContext("2d");
  for (var i = 0; i < 64; i++) {
    x.fillStyle = "hsl(" + (44 + i) + " 70% " + (30 + (i % 24)) + "%)";
    x.fillRect(i * 10, 260 - (i % 17) * 14, 8, (i % 17) * 14);
  }
</script>`;

export const InteractiveDashboard = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactFrame html={DASHBOARD} title="Signups dashboard" />
	</div>
);

export const ShortDocument = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactFrame html={SHORT} title="Deploy checklist" />
	</div>
);

export const DrawsItsOwnGraphics = (): React.JSX.Element => (
	<div className="w-[720px]">
		<ArtifactFrame html={CANVAS} title="Throughput" />
	</div>
);
