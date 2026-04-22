/**
 * Theme Switcher — Lucid Light/Dark
 *
 * Inject into any HTML component file to add a theme toggle in the top-right corner.
 * Usage: <script src="themes/_switcher.js"></script>
 */
(() => {
	const THEMES = [
		{ id: "lucid-dark", label: "Dark", file: "themes/lucid-dark.css" },
		{ id: "lucid-light", label: "Light", file: "themes/lucid-light.css" },
	];

	const links = {};
	for (const theme of THEMES) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = theme.file;
		link.dataset.theme = theme.id;
		link.disabled = theme.id !== "lucid-dark";
		document.head.appendChild(link);
		links[theme.id] = link;
	}

	function setTheme(themeId) {
		for (const [id, link] of Object.entries(links)) {
			link.disabled = id !== themeId;
		}
		document.documentElement.setAttribute("data-theme", themeId);
		localStorage.setItem("ds-theme", themeId);

		for (const btn of document.querySelectorAll(".__ts-btn")) {
			btn.style.background =
				btn.dataset.theme === themeId ? "rgba(224,231,255,0.14)" : "transparent";
			btn.style.color =
				btn.dataset.theme === themeId ? "var(--primary, #e0e7ff)" : "var(--text-mid, #a0a0a6)";
		}
	}

	const switcher = document.createElement("div");
	switcher.id = "__theme-switcher";
	switcher.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 99998;
    display: flex; gap: 4px; padding: 4px;
    background: var(--surface-3, #27272b); border: 1px solid var(--border-default, rgba(255,255,255,0.1));
    border-radius: 8px; font-family: var(--ui, Geist, system-ui); font-size: 11px;
  `;

	for (const theme of THEMES) {
		const btn = document.createElement("button");
		btn.className = "__ts-btn";
		btn.dataset.theme = theme.id;
		btn.textContent = theme.label;
		btn.style.cssText = `
      padding: 4px 10px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 11px; font-family: inherit; transition: background 80ms;
      background: transparent; color: var(--text-mid, #a0a0a6);
    `;
		btn.addEventListener("click", () => setTheme(theme.id));
		switcher.appendChild(btn);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			document.body.appendChild(switcher);
			const saved = localStorage.getItem("ds-theme");
			setTheme(saved && links[saved] ? saved : "lucid-dark");
		});
	} else {
		document.body.appendChild(switcher);
		const saved = localStorage.getItem("ds-theme");
		setTheme(saved && links[saved] ? saved : "lucid-dark");
	}
})();
