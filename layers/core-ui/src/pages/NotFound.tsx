import { type JSX, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ErrorState, PageHeader, PageScaffold } from "../ds";

const SAD_FACE_ICON = (
	<svg
		width="24"
		height="24"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
		style={{ color: "var(--accent-secondary)" }}
	>
		<circle cx="12" cy="12" r="10" />
		<path d="M16 16s-1.5-2-4-2-4 2-4 2" />
		<line x1="9" y1="9" x2="9.01" y2="9" />
		<line x1="15" y1="9" x2="15.01" y2="9" />
	</svg>
);

export function NotFound(): JSX.Element {
	const navigate = useNavigate();

	useEffect(() => {
		const root = document.getElementById("root");
		if (!root) return;
		const prev = root.style.height;
		root.style.height = "100vh";
		return () => {
			root.style.height = prev;
		};
	}, []);

	return (
		<PageScaffold
			header={<PageHeader title="Page not found" />}
			data-testid="not-found-page"
			body="managed"
		>
			<div className="flex-1 flex items-center justify-center p-[48px_24px]">
				<ErrorState
					title=""
					description="The page you're looking for doesn't exist or has been moved. If you followed a link, it may be outdated."
					icon={SAD_FACE_ICON}
					iconBg="rgba(217,119,6,0.08)"
					action={
						<>
							<Button
								variant="primary"
								onClick={() => navigate("/conversations")}
								data-testid="not-found-go-to-conversations"
							>
								Go to conversations
							</Button>
							<Button
								variant="secondary"
								onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/work"))}
								data-testid="not-found-go-back"
							>
								Go back
							</Button>
						</>
					}
				/>
			</div>
		</PageScaffold>
	);
}
