import { useState } from "preact/hooks";
import { ActivityFeed } from "./components/ActivityFeed.js";
import { DomainStats } from "./components/DomainStats.js";
import { SuggestionList } from "./components/SuggestionList.js";
import { ReminderManager } from "./components/ReminderManager.js";
import { Settings } from "./components/Settings.js";
import { SiteDashboard } from "./components/SiteDashboard.js";
import { SemanticSearch } from "./components/SemanticSearch.js";
import { SnapshotDiff } from "./components/SnapshotDiff.js";

type Tab = "activity" | "stats" | "suggestions" | "reminders" | "settings" | "search";

const TABS: { id: Tab; label: string }[] = [
	{ id: "activity", label: "Activity" },
	{ id: "stats", label: "Stats" },
	{ id: "suggestions", label: "Suggestions" },
	{ id: "reminders", label: "Reminders" },
	{ id: "settings", label: "Settings" },
	{ id: "search", label: "Search" },
];

function ImpactLogo({ size = 28 }: { size?: number }) {
	const r = Math.round(size * 0.21);
	const pad = Math.round(size * 0.18);
	const bh = Math.max(2, Math.round(size * 0.11));
	const sw = Math.max(2, Math.round(size * 0.18));
	const sx = Math.round((size - sw) / 2);
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
			<rect width={size} height={size} rx={r} fill="#16213e"/>
			<rect x={pad} y={pad} width={size - pad * 2} height={bh} fill="#228be6"/>
			<rect x={pad} y={size - pad - bh} width={size - pad * 2} height={bh} fill="#228be6"/>
			<rect x={sx} y={pad} width={sw} height={size - pad * 2} fill="white"/>
		</svg>
	);
}

export function App() {
	const params = new URLSearchParams(location.search);
	const initialTab = params.get("tab") as Tab | null;
	const [tab, setTab] = useState<Tab>((initialTab && TABS.some(t => t.id === initialTab)) ? initialTab : "activity");
	const siteDomain = params.get("domain");
	const siteUrl = params.get("url") ?? undefined;
	const sitePrompt = params.get("prompt") ?? undefined;
	const viewDiff = params.get("view") === "diff" && !!siteDomain && !!siteUrl;

	const card: Record<string, string> = {
		background: "#1e2d50",
		borderRadius: "12px",
		border: "1px solid rgba(255,255,255,0.07)",
	};

	return (
		<div style={{ minHeight: "100vh", background: "#0f1829", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", color: "#e2e8f0" }}>
			<header style={{
				background: "#16213e",
				borderBottom: "1px solid rgba(255,255,255,0.07)",
				padding: "0 28px",
				display: "flex",
				alignItems: "center",
				gap: 20,
				position: "sticky",
				top: 0,
				zIndex: 100,
			}}>
				<div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 0", marginRight: 8 }}>
					<ImpactLogo size={26} />
					<span style={{ fontSize: 17, fontWeight: 800, color: "white", letterSpacing: "0.08em" }}>MPACT</span>
				</div>
				{siteDomain ? (
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						<a href="/" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", textDecoration: "none", padding: "18px 4px", borderBottom: "2px solid transparent" }}>
							← All sites
						</a>
						<span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
						<a href={`/?domain=${encodeURIComponent(siteDomain)}`} style={{ fontSize: 13, color: viewDiff ? "rgba(255,255,255,0.45)" : "white", textDecoration: "none", padding: "18px 4px", borderBottom: viewDiff ? "2px solid transparent" : "2px solid #228be6" }}>{siteDomain}</a>
						{viewDiff && <>
							<span style={{ color: "rgba(255,255,255,0.15)" }}>/</span>
							<span style={{ fontSize: 13, color: "white", padding: "18px 4px", borderBottom: "2px solid #ffd43b" }}>Differences</span>
						</>}
					</div>
				) : (
					<nav style={{ display: "flex", gap: 2 }}>
						{TABS.map(t => (
							<button
								key={t.id}
								onClick={() => setTab(t.id)}
								style={{
									padding: "18px 14px",
									border: "none",
									background: "none",
									cursor: "pointer",
									fontSize: 13,
									fontWeight: 500,
									color: tab === t.id ? "white" : "rgba(255,255,255,0.45)",
									borderBottom: tab === t.id ? "2px solid #228be6" : "2px solid transparent",
									transition: "color 0.15s",
									letterSpacing: "0.01em",
								}}
							>
								{t.label}
							</button>
						))}
					</nav>
				)}
			</header>

			<main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px" }}>
				{viewDiff ? (
					<SnapshotDiff domain={siteDomain!} url={siteUrl!} />
				) : siteDomain ? (
					<SiteDashboard domain={siteDomain} url={siteUrl} initialPrompt={sitePrompt} />
				) : (
					<>
						{tab === "activity"    && <ActivityFeed />}
						{tab === "stats"       && <DomainStats />}
						{tab === "suggestions" && <SuggestionList />}
						{tab === "reminders"   && <ReminderManager />}
						{tab === "settings"    && <Settings initialUrl={siteUrl} />}
						{tab === "search"      && <SemanticSearch />}
					</>
				)}
			</main>
		</div>
	);
}
