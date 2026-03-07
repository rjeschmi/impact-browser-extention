import { useState, useEffect } from "preact/hooks";
import { getSettings, getBlocklist, addBlocklistDomain, removeBlocklistDomain, purgeData, getExportUrl } from "../lib/api.js";

type Stats = { visits: number; extractions: number; suggestions: number; reminders: number; llmEnabled: boolean; ollamaModel: string };

export function Settings() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [blocklist, setBlocklist] = useState<string[]>([]);
	const [newDomain, setNewDomain] = useState("");
	const [purging, setPurging] = useState(false);
	const [purgeDays, setPurgeDays] = useState(30);
	const [purgeResult, setPurgeResult] = useState<string | null>(null);

	useEffect(() => {
		getSettings().then(setStats).catch(() => {});
		getBlocklist().then(d => setBlocklist(d.blocklist)).catch(() => {});
	}, []);

	async function handleAddDomain(e: Event) {
		e.preventDefault();
		const domain = newDomain.trim().replace(/^https?:\/\//, "").split("/")[0];
		if (!domain) return;
		const data = await addBlocklistDomain(domain);
		setBlocklist(data.blocklist);
		setNewDomain("");
	}

	async function handleRemoveDomain(domain: string) {
		const data = await removeBlocklistDomain(domain);
		setBlocklist(data.blocklist);
	}

	async function handlePurge() {
		if (!confirm(`Delete all data older than ${purgeDays} days? This cannot be undone.`)) return;
		setPurging(true);
		try {
			const result = await purgeData(purgeDays);
			setPurgeResult(`Deleted ${result.deleted.visits} visits and ${result.deleted.extractions} extractions.`);
			getSettings().then(setStats).catch(() => {});
		} finally {
			setPurging(false);
		}
	}

	const sectionStyle = {
		background: "white", borderRadius: 10, border: "1px solid #e9ecef",
		padding: "16px", marginBottom: 16,
	};
	const labelStyle = { fontSize: 13, fontWeight: 600 as const, color: "#868e96", textTransform: "uppercase" as const, letterSpacing: "0.05em", display: "block", marginBottom: 10 };
	const inputStyle = { padding: "8px 12px", border: "1px solid #dee2e6", borderRadius: 8, fontSize: 14, outline: "none" };

	return (
		<div>
			{/* Database stats */}
			<div style={sectionStyle}>
				<span style={labelStyle}>Database</span>
				{stats ? (
					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
						{[
							["Visits", stats.visits],
							["Extractions", stats.extractions],
							["Suggestions", stats.suggestions],
							["Reminders", stats.reminders],
						].map(([label, count]) => (
							<div key={label} style={{ padding: "10px 12px", background: "#f8f9fa", borderRadius: 8 }}>
								<div style={{ fontSize: 20, fontWeight: 700 }}>{count}</div>
								<div style={{ fontSize: 12, color: "#868e96" }}>{label}</div>
							</div>
						))}
					</div>
				) : (
					<p style={{ color: "#868e96", fontSize: 14 }}>Loading...</p>
				)}
			</div>

			{/* LLM status */}
			<div style={sectionStyle}>
				<span style={labelStyle}>AI Analysis (Ollama)</span>
				{stats ? (
					<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<div style={{
							width: 8, height: 8, borderRadius: "50%",
							background: stats.llmEnabled ? "#51cf66" : "#adb5bd",
						}} />
						<span style={{ fontSize: 14 }}>
							{stats.llmEnabled
								? `Enabled — using ${stats.ollamaModel}`
								: "Disabled — set IMPACT_LLM=1 to enable"}
						</span>
					</div>
				) : null}
				<p style={{ fontSize: 12, color: "#adb5bd", marginTop: 8 }}>
					Restart with <code style={{ background: "#f1f3f5", padding: "1px 4px", borderRadius: 3 }}>IMPACT_LLM=1 bun run dev:backend</code> to enable.
					Requires <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" style={{ color: "#1c7ed6" }}>Ollama</a> running locally.
				</p>
			</div>

			{/* Domain blocklist */}
			<div style={sectionStyle}>
				<span style={labelStyle}>Domain Blocklist</span>
				<p style={{ fontSize: 13, color: "#868e96", marginBottom: 12 }}>
					These domains are skipped during tracking and analysis.
				</p>
				<form onSubmit={handleAddDomain} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
					<input
						placeholder="example.com"
						value={newDomain}
						onInput={e => setNewDomain((e.target as HTMLInputElement).value)}
						style={{ ...inputStyle, flex: 1 }}
					/>
					<button type="submit" style={{ padding: "8px 16px", background: "#228be6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>
						Add
					</button>
				</form>
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{blocklist.map(domain => (
						<div key={domain} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#f8f9fa", borderRadius: 6 }}>
							<span style={{ fontSize: 14 }}>{domain}</span>
							<button onClick={() => handleRemoveDomain(domain)} style={{ padding: "2px 8px", background: "none", border: "1px solid #dee2e6", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#868e96" }}>
								Remove
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Export */}
			<div style={sectionStyle}>
				<span style={labelStyle}>Export Data</span>
				<p style={{ fontSize: 13, color: "#868e96", marginBottom: 12 }}>
					Download all your data as JSON.
				</p>
				<a href={getExportUrl()} download style={{
					display: "inline-block", padding: "8px 16px", background: "#e9ecef",
					color: "#495057", borderRadius: 8, fontSize: 14, textDecoration: "none",
				}}>
					Download export.json
				</a>
			</div>

			{/* Purge */}
			<div style={{ ...sectionStyle, borderColor: "#ffc9c9" }}>
				<span style={{ ...labelStyle, color: "#ff6b6b" }}>Danger Zone</span>
				<p style={{ fontSize: 13, color: "#868e96", marginBottom: 12 }}>
					Permanently delete old visits and extractions.
				</p>
				<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
					<span style={{ fontSize: 14 }}>Delete data older than</span>
					<select
						value={purgeDays}
						onChange={e => setPurgeDays(Number((e.target as HTMLSelectElement).value))}
						style={{ ...inputStyle, padding: "6px 10px" }}
					>
						{[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
					</select>
					<button onClick={handlePurge} disabled={purging} style={{
						padding: "8px 16px", background: "#fff0f0", color: "#ff6b6b",
						border: "1px solid #ffc9c9", borderRadius: 8, cursor: "pointer", fontSize: 14,
					}}>
						{purging ? "Purging..." : "Purge"}
					</button>
				</div>
				{purgeResult && <p style={{ fontSize: 13, color: "#51cf66", marginTop: 8 }}>{purgeResult}</p>}
			</div>
		</div>
	);
}
