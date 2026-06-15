/**
 * Theme Switcher — Hearth Light/Dark
 *
 * Inject into any HTML component file to add a theme toggle in the top-right corner.
 * Usage: <script src="themes/_switcher.js"></script>
 *
 * @lore U4 — Updated from Lucid to Hearth. Default is hearth-light (Hearth is
 * light-first). Active button styles use Hearth tokens instead of Lucid.
 */
(() => {
	const THEMES = [
		{ id: "hearth-light", label: "Light", file: "themes/hearth-light.css" },
		{ id: "hearth-dark", label: "Dark", file: "themes/hearth-dark.css" },
	];

	const links = {};
	for (const theme of THEMES) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = theme.file;
		link.dataset.theme = theme.id;
		link.disabled = theme.id !== "hearth-light";
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
				btn.dataset.theme === themeId ? "var(--accent-primary-dim, rgba(22,118,79,0.08))" : "transparent";
			btn.style.color =
				btn.dataset.theme === themeId ? "var(--accent-primary, #16764f)" : "var(--text-secondary, #6b5d4d)";
		}
	}

	const switcher = document.createElement("div");
	switcher.id = "__theme-switcher";
	switcher.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 99998;
    display: flex; gap: 4px; padding: 4px;
    background: var(--surface-elevated, #ffffff); border: 1px solid var(--border-default, #d5cbb8);
    border-radius: 8px; font-family: var(--font-sans, system-ui); font-size: 11px;
  `;

	for (const theme of THEMES) {
		const btn = document.createElement("button");
		btn.className = "__ts-btn";
		btn.dataset.theme = theme.id;
		btn.textContent = theme.label;
		btn.style.cssText = `
      padding: 4px 10px; border: none; border-radius: 6px; cursor: pointer;
      font-size: 11px; font-family: inherit; transition: background 120ms;
      background: transparent; color: var(--text-secondary, #6b5d4d);
    `;
		btn.addEventListener("click", () => setTheme(theme.id));
		switcher.appendChild(btn);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			document.body.appendChild(switcher);
			const saved = localStorage.getItem("ds-theme");
			setTheme(saved && links[saved] ? saved : "hearth-light");
		});
	} else {
		document.body.appendChild(switcher);
		const saved = localStorage.getItem("ds-theme");
		setTheme(saved && links[saved] ? saved : "hearth-light");
	}
})();
