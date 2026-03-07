import { useState } from "preact/hooks";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { DomainStats } from "./components/DomainStats.js";
import { SuggestionList } from "./components/SuggestionList.js";
import { ReminderManager } from "./components/ReminderManager.js";
import { Settings } from "./components/Settings.js";

type Tab = "activity" | "stats" | "suggestions" | "reminders" | "settings";

const TABS: { id: Tab; label: string }[] = [
	{ id: "activity", label: "Activity" },
	{ id: "stats", label: "Stats" },
	{ id: "suggestions", label: "Suggestions" },
	{ id: "reminders", label: "Reminders" },
	{ id: "settings", label: "Settings" },
];

export function App() {
	const [tab, setTab] = useState<Tab>("activity");

	return (
		<div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
			<header style={{
				background: "white", borderBottom: "1px solid #e9ecef",
				padding: "0 24px", display: "flex", alignItems: "center", gap: 24,
				position: "sticky", top: 0, zIndex: 100,
			}}>
				<h1 style={{ fontSize: 20, fontWeight: 700, color: "#16213e", margin: "0 16px 0 0", padding: "16px 0" }}>
					Impact
				</h1>
				<nav style={{ display: "flex", gap: 4 }}>
					{TABS.map(t => (
						<button
							key={t.id}
							onClick={() => setTab(t.id)}
							style={{
								padding: "18px 16px", border: "none", background: "none",
								cursor: "pointer", fontSize: 14, fontWeight: 500,
								color: tab === t.id ? "#228be6" : "#495057",
								borderBottom: tab === t.id ? "2px solid #228be6" : "2px solid transparent",
								transition: "color 0.15s",
							}}
						>
							{t.label}
						</button>
					))}
				</nav>
			</header>

			<main style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
				{tab === "activity" && <ActivityFeed />}
				{tab === "stats" && <DomainStats />}
				{tab === "suggestions" && <SuggestionList />}
			{tab === "reminders" && <ReminderManager />}
			{tab === "settings" && <Settings />}
			</main>
		</div>
	);
}
