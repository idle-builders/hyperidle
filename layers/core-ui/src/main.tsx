import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./tokens.css";
import "./app.css";

// The desktop window has no title bar: its close, minimise and zoom buttons sit over the page.
if (window.__HYPERIDLE__) document.documentElement.dataset.shell = "desktop";

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
