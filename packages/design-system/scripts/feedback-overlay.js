/**
 * Design Feedback Bookmarklet
 *
 * Inject this into any running HyperIdle page to enter "feedback mode":
 * - Click any element to select it (highlights with blue outline)
 * - Type feedback in the popup textarea
 * - Tweak CSS properties live (font-size, color, padding, margin, background, border-radius, gap, opacity)
 * - Click "Copy for Claude" to copy a structured feedback block to clipboard
 * - Paste it into Claude Code for immediate action
 *
 * Usage: Run `bun run ds:feedback` to get the bookmarklet URL, or
 * paste the minified version into your browser's address bar.
 *
 * @lore This is a zero-dependency alternative to Vibe Annotations or Drawbridge.
 * For a richer experience with MCP integration, install Vibe Annotations:
 * https://github.com/RaphaelRegnier/vibe-annotations
 */

(() => {
	if (document.getElementById("__ds-feedback-overlay")) return;

	let selectedEl = null;
	let originalStyles = {};
	const tweaks = {};
	const annotations = [];

	// --- Overlay UI ---
	const overlay = document.createElement("div");
	overlay.id = "__ds-feedback-overlay";
	overlay.innerHTML = `
    <style>
      #__ds-feedback-overlay {
        position: fixed; bottom: 16px; right: 16px; z-index: 99999;
        width: 360px; max-height: 80vh; overflow-y: auto;
        background: #1a1a1e; color: #e7e5e4; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px; font-family: Inter, system-ui, sans-serif; font-size: 13px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      }
      #__ds-feedback-overlay * { box-sizing: border-box; }
      .__ds-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.08);
        font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;
        color: #808080; cursor: move;
      }
      .__ds-close { cursor: pointer; color: #808080; font-size: 16px; line-height: 1; }
      .__ds-close:hover { color: #e7e5e4; }
      .__ds-body { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; }
      .__ds-selected-info {
        font-family: "Space Grotesk", monospace; font-size: 11px; color: #808080;
        padding: 4px 8px; background: rgba(255,255,255,0.04); border-radius: 4px;
        word-break: break-all;
      }
      .__ds-textarea {
        width: 100%; min-height: 60px; background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;
        color: #e7e5e4; font-family: Inter, system-ui; font-size: 13px;
        padding: 8px; resize: vertical;
      }
      .__ds-textarea:focus { outline: 1px solid #adc6ff; border-color: transparent; }
      .__ds-tweaks { display: flex; flex-direction: column; gap: 4px; }
      .__ds-tweak-row {
        display: flex; align-items: center; gap: 8px;
      }
      .__ds-tweak-row label {
        font-size: 11px; color: #808080; width: 80px; flex-shrink: 0;
        font-family: "Space Grotesk", monospace; text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .__ds-tweak-row input {
        flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 2px; color: #e7e5e4; font-size: 12px; padding: 2px 6px;
        font-family: "Space Grotesk", monospace;
      }
      .__ds-tweak-row input:focus { outline: 1px solid #adc6ff; border-color: transparent; }
      .__ds-btn {
        padding: 6px 12px; border: none; border-radius: 2px; cursor: pointer;
        font-size: 12px; font-weight: 500; transition: background 120ms;
      }
      .__ds-btn-primary { background: rgba(173,198,255,0.12); color: #adc6ff; }
      .__ds-btn-primary:hover { background: rgba(173,198,255,0.18); }
      .__ds-btn-secondary { background: rgba(255,255,255,0.06); color: #acabaa; }
      .__ds-btn-secondary:hover { background: rgba(255,255,255,0.1); }
      .__ds-btn-row { display: flex; gap: 8px; }
      .__ds-annotations { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
      .__ds-annotation {
        font-size: 11px; color: #acabaa; padding: 4px 8px;
        background: rgba(255,255,255,0.03); border-radius: 2px;
        border-left: 2px solid #adc6ff;
      }
      .__ds-annotation-target { color: #808080; font-family: "Space Grotesk", monospace; font-size: 10px; }
      .__ds-highlight { outline: 2px solid #adc6ff !important; outline-offset: 2px !important; }
      .__ds-hover-highlight { outline: 1px dashed rgba(173,198,255,0.4) !important; outline-offset: 1px !important; }
      .__ds-section-title {
        font-size: 11px; font-weight: 600; color: #808080; text-transform: uppercase;
        letter-spacing: 0.05em; margin-top: 4px;
      }
      .__ds-copied {
        position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
        background: rgba(173,198,255,0.12); color: #adc6ff; padding: 8px 16px;
        border-radius: 4px; font-size: 13px; font-weight: 500; z-index: 100000;
        animation: __ds-fade 2s forwards;
      }
      @keyframes __ds-fade { 0%,70% { opacity: 1; } 100% { opacity: 0; } }
    </style>
    <div class="__ds-header">
      <span>Design Feedback</span>
      <span class="__ds-close" id="__ds-close">&times;</span>
    </div>
    <div class="__ds-body">
      <div class="__ds-selected-info" id="__ds-selected-info">Click any element to select it</div>
      <div class="__ds-section-title">Feedback</div>
      <textarea class="__ds-textarea" id="__ds-comment" placeholder="What should change about this element?"></textarea>
      <div class="__ds-section-title">Live CSS Tweaks</div>
      <div class="__ds-tweaks" id="__ds-tweaks"></div>
      <div class="__ds-btn-row">
        <button class="__ds-btn __ds-btn-primary" id="__ds-add">Add Annotation</button>
        <button class="__ds-btn __ds-btn-secondary" id="__ds-reset">Reset Tweaks</button>
      </div>
      <div class="__ds-section-title">Annotations (<span id="__ds-count">0</span>)</div>
      <div class="__ds-annotations" id="__ds-annotations"></div>
      <div class="__ds-btn-row">
        <button class="__ds-btn __ds-btn-primary" id="__ds-copy">Copy for Claude</button>
        <button class="__ds-btn __ds-btn-secondary" id="__ds-clear">Clear All</button>
      </div>
    </div>
  `;
	document.body.appendChild(overlay);

	const tweakProps = [
		"font-size",
		"font-weight",
		"color",
		"background",
		"padding",
		"margin",
		"gap",
		"border-radius",
		"opacity",
		"border",
	];

	function buildTweakInputs() {
		const container = document.getElementById("__ds-tweaks");
		container.innerHTML = "";
		for (const prop of tweakProps) {
			const row = document.createElement("div");
			row.className = "__ds-tweak-row";
			const label = document.createElement("label");
			label.textContent = prop;
			const input = document.createElement("input");
			input.type = "text";
			input.dataset.prop = prop;
			input.placeholder = selectedEl ? getComputedStyle(selectedEl).getPropertyValue(prop) : "";
			input.value = tweaks[prop] || "";
			input.addEventListener("input", () => {
				if (!selectedEl) return;
				if (input.value) {
					if (!originalStyles[prop]) {
						originalStyles[prop] = selectedEl.style.getPropertyValue(prop);
					}
					selectedEl.style.setProperty(prop, input.value, "important");
					tweaks[prop] = input.value;
				} else {
					if (originalStyles[prop] !== undefined) {
						selectedEl.style.setProperty(prop, originalStyles[prop]);
					} else {
						selectedEl.style.removeProperty(prop);
					}
					delete tweaks[prop];
				}
			});
			row.appendChild(label);
			row.appendChild(input);
			container.appendChild(row);
		}
	}
	buildTweakInputs();

	function getSelector(el) {
		if (el.id) return `#${el.id}`;
		const dataComponent = el.getAttribute("data-component");
		if (dataComponent) return `[data-component="${dataComponent}"]`;
		const parts = [];
		let current = el;
		for (let i = 0; i < 3 && current && current !== document.body; i++) {
			let selector = current.tagName.toLowerCase();
			if (current.className && typeof current.className === "string") {
				const classes = current.className
					.split(/\s+/)
					.filter((c) => c && !c.startsWith("__ds-") && !c.startsWith("hover:") && c.length < 40)
					.slice(0, 2);
				if (classes.length > 0) {
					selector += `.${classes.join(".")}`;
				}
			}
			parts.unshift(selector);
			current = current.parentElement;
		}
		return parts.join(" > ");
	}

	function getComponentContext(el) {
		let current = el;
		while (current && current !== document.body) {
			const comp = current.getAttribute("data-component");
			if (comp) {
				return {
					name: comp,
					tier: current.getAttribute("data-tier"),
					uses: current.getAttribute("data-uses"),
				};
			}
			current = current.parentElement;
		}
		return null;
	}

	function getRelevantStyles(el) {
		const computed = getComputedStyle(el);
		const props = [
			"font-size",
			"font-weight",
			"font-family",
			"color",
			"background-color",
			"padding",
			"margin",
			"gap",
			"border-radius",
			"border",
			"display",
			"flex-direction",
			"align-items",
			"justify-content",
			"width",
			"height",
			"opacity",
		];
		const result = {};
		for (const p of props) {
			result[p] = computed.getPropertyValue(p);
		}
		return result;
	}

	// --- Element selection ---
	let hoverEl = null;

	function onMouseMove(e) {
		if (e.target.closest("#__ds-feedback-overlay") || e.target.id === "__ds-feedback-overlay") {
			return;
		}
		if (hoverEl) hoverEl.classList.remove("__ds-hover-highlight");
		hoverEl = e.target;
		hoverEl.classList.add("__ds-hover-highlight");
	}

	function onMouseClick(e) {
		if (e.target.closest("#__ds-feedback-overlay") || e.target.id === "__ds-feedback-overlay") {
			return;
		}
		e.preventDefault();
		e.stopPropagation();

		if (selectedEl) selectedEl.classList.remove("__ds-highlight");
		if (hoverEl) hoverEl.classList.remove("__ds-hover-highlight");

		selectedEl = e.target;
		selectedEl.classList.add("__ds-highlight");
		originalStyles = {};
		Object.keys(tweaks).forEach((k) => delete tweaks[k]);

		const sel = getSelector(selectedEl);
		const comp = getComponentContext(selectedEl);
		const info = document.getElementById("__ds-selected-info");
		info.textContent = comp ? `${comp.name} (Tier ${comp.tier}) — ${sel}` : sel;

		buildTweakInputs();
	}

	document.addEventListener("mousemove", onMouseMove, true);
	document.addEventListener("click", onMouseClick, true);

	// --- Add annotation ---
	document.getElementById("__ds-add").addEventListener("click", () => {
		if (!selectedEl) return;
		const comment = document.getElementById("__ds-comment").value.trim();
		if (!comment && Object.keys(tweaks).length === 0) return;

		const annotation = {
			selector: getSelector(selectedEl),
			component: getComponentContext(selectedEl),
			comment,
			tweaks: { ...tweaks },
			computedStyles: getRelevantStyles(selectedEl),
			tagName: selectedEl.tagName.toLowerCase(),
			textContent: selectedEl.textContent.slice(0, 80).trim(),
		};
		annotations.push(annotation);

		document.getElementById("__ds-comment").value = "";
		renderAnnotations();
	});

	// --- Reset tweaks ---
	document.getElementById("__ds-reset").addEventListener("click", () => {
		if (!selectedEl) return;
		for (const [prop, original] of Object.entries(originalStyles)) {
			if (original) {
				selectedEl.style.setProperty(prop, original);
			} else {
				selectedEl.style.removeProperty(prop);
			}
		}
		originalStyles = {};
		Object.keys(tweaks).forEach((k) => delete tweaks[k]);
		buildTweakInputs();
	});

	function renderAnnotations() {
		const container = document.getElementById("__ds-annotations");
		const count = document.getElementById("__ds-count");
		count.textContent = annotations.length;
		container.innerHTML = annotations
			.map(
				(a) => `
      <div class="__ds-annotation">
        <div class="__ds-annotation-target">${a.component ? `${a.component.name} — ` : ""}${a.selector}</div>
        ${a.comment ? `<div>${a.comment}</div>` : ""}
        ${
					Object.keys(a.tweaks).length > 0
						? `<div style="color:#adc6ff;font-size:10px">${Object.entries(a.tweaks)
								.map(([k, v]) => `${k}: ${v}`)
								.join("; ")}</div>`
						: ""
				}
      </div>
    `,
			)
			.join("");
	}

	// --- Copy for Claude ---
	document.getElementById("__ds-copy").addEventListener("click", () => {
		if (annotations.length === 0) return;

		const pageUrl = window.location.href;
		let output = `## Design Feedback — ${new Date().toISOString().slice(0, 16)}\n`;
		output += `**Page:** ${pageUrl}\n\n`;

		for (let i = 0; i < annotations.length; i++) {
			const a = annotations[i];
			output += `### ${i + 1}. ${a.component ? `${a.component.name}` : a.selector}\n`;
			output += `**Selector:** \`${a.selector}\`\n`;
			if (a.component) {
				output += `**Component:** ${a.component.name} (Tier ${a.component.tier})`;
				if (a.component.uses) output += ` — uses: ${a.component.uses}`;
				output += "\n";
			}
			output += `**Element:** \`<${a.tagName}>\` — "${a.textContent}"\n`;
			if (a.comment) {
				output += `**Feedback:** ${a.comment}\n`;
			}
			if (Object.keys(a.tweaks).length > 0) {
				output += "**CSS Tweaks (applied live, worked well):**\n```css\n";
				for (const [prop, val] of Object.entries(a.tweaks)) {
					output += `${prop}: ${val};\n`;
				}
				output += "```\n";
			}
			output += "**Current computed styles:**\n```css\n";
			for (const [prop, val] of Object.entries(a.computedStyles)) {
				output += `${prop}: ${val};\n`;
			}
			output += "```\n\n";
		}

		output += `---\n*${annotations.length} annotation(s). Paste this into Claude Code for action.*\n`;

		navigator.clipboard.writeText(output).then(() => {
			const toast = document.createElement("div");
			toast.className = "__ds-copied";
			toast.textContent = `Copied ${annotations.length} annotation(s) to clipboard`;
			document.body.appendChild(toast);
			setTimeout(() => toast.remove(), 2000);
		});
	});

	// --- Clear all ---
	document.getElementById("__ds-clear").addEventListener("click", () => {
		annotations.length = 0;
		renderAnnotations();
	});

	// --- Close ---
	document.getElementById("__ds-close").addEventListener("click", () => {
		if (selectedEl) selectedEl.classList.remove("__ds-highlight");
		if (hoverEl) hoverEl.classList.remove("__ds-hover-highlight");
		document.removeEventListener("mousemove", onMouseMove, true);
		document.removeEventListener("click", onMouseClick, true);
		overlay.remove();
	});

	// --- Make draggable ---
	const header = overlay.querySelector(".__ds-header");
	let dragging = false;
	let dragX;
	let dragY;
	header.addEventListener("mousedown", (e) => {
		dragging = true;
		dragX = e.clientX - overlay.getBoundingClientRect().left;
		dragY = e.clientY - overlay.getBoundingClientRect().top;
		e.preventDefault();
	});
	document.addEventListener("mousemove", (e) => {
		if (!dragging) return;
		overlay.style.left = `${e.clientX - dragX}px`;
		overlay.style.top = `${e.clientY - dragY}px`;
		overlay.style.right = "auto";
		overlay.style.bottom = "auto";
	});
	document.addEventListener("mouseup", () => {
		dragging = false;
	});
})();
