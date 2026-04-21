/**
 * Theme Switcher
 *
 * Inject into any HTML component file to add a theme picker in the top-right corner.
 * Loads theme CSS files from the themes/ directory and switches via data-theme attribute.
 *
 * Usage: <script src="themes/_switcher.js"></script>
 */
(() => {
	const THEMES = [
		{ id: "factory-dark", label: "Factory Dark", file: "themes/factory-dark.css" },
		{ id: "calm-precision", label: "Calm Precision", file: "themes/calm-precision.css" },
		{ id: "light-ops", label: "Light Ops", file: "themes/light-ops.css" },
		{ id: "mono-machine", label: "Mono Machine", file: "themes/mono-machine.css" },
	];

	// Load all theme stylesheets (disabled by default)
	const links = {};
	for (const theme of THEMES) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = theme.file;
		link.dataset.theme = theme.id;
		link.disabled = theme.id !== "factory-dark";
		document.head.appendChild(link);
		links[theme.id] = link;
	}

	function setTheme(themeId) {
		for (const [id, link] of Object.entries(links)) {
			link.disabled = id !== themeId;
		}
		document.documentElement.setAttribute("data-theme", themeId);

		// Update body background for light themes
		const isLight = themeId === "light-ops";
		document.body.style.backgroundColor = "";
		document.body.style.color = "";

		localStorage.setItem("ds-theme", themeId);

		// Update active button
		for (const btn of document.querySelectorAll(".__ts-btn")) {
			btn.style.background =
				btn.dataset.theme === themeId ? "rgba(173,198,255,0.18)" : "transparent";
			btn.style.color =
				btn.dataset.theme === themeId ? "var(--primary, #adc6ff)" : "var(--text-mid, #acabaa)";
		}
	}

	// Create switcher UI
	const switcher = document.createElement("div");
	switcher.id = "__theme-switcher";
	switcher.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 99998;
    display: flex; gap: 4px; padding: 4px;
    background: var(--surface-3, #191a1a); border: 1px solid var(--border-default, rgba(255,255,255,0.08));
    border-radius: 6px; font-family: var(--ui, Inter, system-ui); font-size: 11px;
  `;

	for (const theme of THEMES) {
		const btn = document.createElement("button");
		btn.className = "__ts-btn";
		btn.dataset.theme = theme.id;
		btn.textContent = theme.label;
		btn.style.cssText = `
      padding: 4px 8px; border: none; border-radius: 4px; cursor: pointer;
      font-size: 11px; font-family: inherit; transition: background 100ms;
      background: transparent; color: var(--text-mid, #acabaa);
    `;
		btn.addEventListener("click", () => setTheme(theme.id));
		switcher.appendChild(btn);
	}

	// Wait for DOM ready
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			document.body.appendChild(switcher);
			const saved = localStorage.getItem("ds-theme");
			if (saved && links[saved]) {
				setTheme(saved);
			} else {
				setTheme("factory-dark");
			}
		});
	} else {
		document.body.appendChild(switcher);
		const saved = localStorage.getItem("ds-theme");
		if (saved && links[saved]) {
			setTheme(saved);
		} else {
			setTheme("factory-dark");
		}
	}
})();
