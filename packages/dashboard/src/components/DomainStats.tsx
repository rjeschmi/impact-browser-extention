import { useState, useEffect } from "preact/hooks";
import { getVisitStats } from "../lib/api.js";
import { formatDuration, getFavicon } from "../lib/format.js";

type Range = "1d" | "7d" | "30d";
const RANGES: { label: string; value: Range; ms: number }[] = [
	{ label: "Today",   value: "1d",  ms: 86400000 },
	{ label: "7 days",  value: "7d",  ms: 7  * 86400000 },
	{ label: "30 days", value: "30d", ms: 30 * 86400000 },
];

const card = { background: "#1e2d50", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" };

export function DomainStats() {
	const [range, setRange] = useState<Range>("7d");
	const [mode, setMode]   = useState<"time" | "visits">("time");
	const [stats, setStats] = useState<{ topDomains: { domain: string; visitCount: number; totalDuration: number }[]; totalVisits: number } | null>(null);

	useEffect(() => {
		const r = RANGES.find(r => r.value === range)!;
		getVisitStats(String(Date.now() - r.ms)).then(setStats).catch(() => {});
	}, [range]);

	const domains = stats?.topDomains ?? [];
	const maxVal = domains.length > 0 ? Math.max(...domains.map(d => mode === "time" ? d.totalDuration : d.visitCount)) : 1;

	const btnBase = { padding: "6px 12px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 };

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" as const }}>
				<div style={{ display: "flex", gap: 3 }}>
					{RANGES.map(r => (
						<button key={r.value} onClick={() => setRange(r.value)} style={{ ...btnBase,
							background: range === r.value ? "#228be6" : "rgba(255,255,255,0.07)",
							color: range === r.value ? "white" : "rgba(255,255,255,0.55)",
						}}>{r.label}</button>
					))}
				</div>
				<div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
					{(["time", "visits"] as const).map(m => (
						<button key={m} onClick={() => setMode(m)} style={{ ...btnBase,
							background: mode === m ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.07)",
							color: mode === m ? "white" : "rgba(255,255,255,0.45)",
						}}>{m === "time" ? "Time spent" : "Visit count"}</button>
					))}
				</div>
			</div>

			{!stats && <p style={{ color: "rgba(255,255,255,0.35)" }}>Loading...</p>}
			{stats && domains.length === 0 && <p style={{ color: "rgba(255,255,255,0.35)" }}>No data for this period yet.</p>}

			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{domains.map(d => {
					const val = mode === "time" ? d.totalDuration : d.visitCount;
					const pct = Math.max(4, (val / maxVal) * 100);
					const label = mode === "time" ? formatDuration(d.totalDuration) : `${d.visitCount} visits`;
					return (
						<div key={d.domain} style={{ ...card, padding: "10px 14px" }}>
							<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
								<img src={getFavicon(d.domain)} width={13} height={13} style={{ opacity: 0.7 }}
									onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
								<span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: "#e2e8f0" }}>{d.domain}</span>
								<span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{label}</span>
							</div>
							<div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
								<div style={{ height: "100%", borderRadius: 3, width: `${pct}%`, background: "linear-gradient(90deg, #228be6, #74c0fc)", transition: "width 0.3s ease" }} />
							</div>
						</div>
					);
				})}
			</div>

			{stats && (
				<p style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
					{stats.totalVisits} total visits in this period
				</p>
			)}
		</div>
	);
}
