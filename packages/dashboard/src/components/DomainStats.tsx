import { useState, useEffect } from "preact/hooks";
import { getVisitStats } from "../lib/api.js";
import { formatDuration } from "../lib/format.js";
import { getFavicon } from "../lib/format.js";

type Range = "1d" | "7d" | "30d";

const RANGES: { label: string; value: Range; ms: number }[] = [
	{ label: "Today", value: "1d", ms: 86400000 },
	{ label: "7 days", value: "7d", ms: 7 * 86400000 },
	{ label: "30 days", value: "30d", ms: 30 * 86400000 },
];

export function DomainStats() {
	const [range, setRange] = useState<Range>("7d");
	const [stats, setStats] = useState<{
		topDomains: { domain: string; visitCount: number; totalDuration: number }[];
		totalVisits: number;
	} | null>(null);
	const [mode, setMode] = useState<"time" | "visits">("time");

	useEffect(() => {
		const r = RANGES.find(r => r.value === range)!;
		const since = String(Date.now() - r.ms);
		getVisitStats(since).then(setStats).catch(() => {});
	}, [range]);

	const domains = stats?.topDomains ?? [];
	const maxVal = domains.length > 0
		? Math.max(...domains.map(d => mode === "time" ? d.totalDuration : d.visitCount))
		: 1;

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
				<div style={{ display: "flex", gap: 4 }}>
					{RANGES.map(r => (
						<button
							key={r.value}
							onClick={() => setRange(r.value)}
							style={{
								padding: "6px 12px", border: "none", borderRadius: 6,
								cursor: "pointer", fontSize: 13,
								background: range === r.value ? "#228be6" : "#e9ecef",
								color: range === r.value ? "white" : "#495057",
							}}
						>
							{r.label}
						</button>
					))}
				</div>
				<div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
					{(["time", "visits"] as const).map(m => (
						<button
							key={m}
							onClick={() => setMode(m)}
							style={{
								padding: "6px 12px", border: "none", borderRadius: 6,
								cursor: "pointer", fontSize: 13,
								background: mode === m ? "#495057" : "#e9ecef",
								color: mode === m ? "white" : "#495057",
							}}
						>
							{m === "time" ? "Time spent" : "Visit count"}
						</button>
					))}
				</div>
			</div>

			{!stats && <p style={{ color: "#868e96" }}>Loading...</p>}
			{stats && domains.length === 0 && (
				<p style={{ color: "#868e96" }}>No data for this period yet.</p>
			)}

			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{domains.map(d => {
					const val = mode === "time" ? d.totalDuration : d.visitCount;
					const pct = Math.max(4, (val / maxVal) * 100);
					const label = mode === "time" ? formatDuration(d.totalDuration) : `${d.visitCount} visits`;
					return (
						<div key={d.domain} style={{
							background: "white", borderRadius: 10,
							border: "1px solid #e9ecef", padding: "10px 14px",
						}}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
								<img
									src={getFavicon(d.domain)}
									width={14} height={14}
									style={{ opacity: 0.8 }}
									onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
								/>
								<span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{d.domain}</span>
								<span style={{ fontSize: 13, color: "#495057" }}>{label}</span>
							</div>
							<div style={{ height: 6, background: "#f1f3f5", borderRadius: 3 }}>
								<div style={{
									height: "100%", borderRadius: 3,
									width: `${pct}%`,
									background: "linear-gradient(90deg, #228be6, #74c0fc)",
									transition: "width 0.3s ease",
								}} />
							</div>
						</div>
					);
				})}
			</div>

			{stats && (
				<p style={{ marginTop: 12, fontSize: 13, color: "#868e96" }}>
					{stats.totalVisits} total visits in this period
				</p>
			)}
		</div>
	);
}
