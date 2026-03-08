import { useState, useEffect, useCallback } from "preact/hooks";
import {
	getLlmStatsSummary,
	getLlmStatsRecent,
	clearLlmStats,
} from "../lib/api.js";
import type { LlmStatRow, LlmTotals, LlmStatCall } from "../lib/api.js";

const TIME_FILTERS = [
	{ label: "All time", ms: 0 },
	{ label: "Last 24h", ms: 24 * 60 * 60 * 1000 },
	{ label: "Last hour", ms: 60 * 60 * 1000 },
];

function fmtMs(ms: number | null | undefined): string {
	if (ms == null) return "—";
	if (ms >= 10000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms)}ms`;
}

function fmtNum(n: number | null | undefined): string {
	if (n == null) return "—";
	return Math.round(n).toLocaleString();
}

function fmtTokensPerSec(avgCompletionTokens: number | null, avgEvalMs: number | null): string {
	if (avgCompletionTokens == null || avgEvalMs == null || avgEvalMs === 0) return "—";
	const tps = (avgCompletionTokens / avgEvalMs) * 1000;
	return `${Math.round(tps)}tok/s`;
}

function fmtPct(success: number, total: number): string {
	if (total === 0) return "—";
	return `${Math.round((success / total) * 100)}%`;
}

function fmtTime(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function truncateUrl(url: string | null, maxLen = 40): string {
	if (!url) return "—";
	if (url.length <= maxLen) return url;
	return `…${url.slice(-(maxLen - 1))}`;
}

const thStyle = {
	fontSize: 10,
	fontWeight: 700,
	color: "rgba(255,255,255,0.35)",
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
	padding: "6px 8px",
	textAlign: "left" as const,
	borderBottom: "1px solid rgba(255,255,255,0.06)",
	whiteSpace: "nowrap" as const,
};

const tdStyle = {
	fontSize: 12,
	color: "rgba(255,255,255,0.7)",
	padding: "5px 8px",
	borderBottom: "1px solid rgba(255,255,255,0.04)",
	whiteSpace: "nowrap" as const,
};

const tableStyle = {
	width: "100%",
	borderCollapse: "collapse" as const,
	tableLayout: "auto" as const,
};

const filterBtnBase = {
	padding: "4px 10px",
	borderRadius: 6,
	border: "1px solid rgba(255,255,255,0.1)",
	fontSize: 12,
	cursor: "pointer",
};

export function LlmStats() {
	const [filterIdx, setFilterIdx] = useState(0);
	const [summary, setSummary] = useState<LlmStatRow[] | null>(null);
	const [totals, setTotals] = useState<LlmTotals | null>(null);
	const [recentCalls, setRecentCalls] = useState<LlmStatCall[] | null>(null);
	const [showRecent, setShowRecent] = useState(false);
	const [loading, setLoading] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async (idx: number) => {
		setLoading(true);
		setError(null);
		try {
			const since = TIME_FILTERS[idx].ms > 0 ? Date.now() - TIME_FILTERS[idx].ms : undefined;
			const [summaryData, recentData] = await Promise.all([
				getLlmStatsSummary(since),
				getLlmStatsRecent(50),
			]);
			setSummary(summaryData.summary);
			setTotals(summaryData.totals);
			setRecentCalls(recentData.calls);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load(filterIdx);
	}, [filterIdx, load]);

	async function handleClear() {
		if (!confirm("Clear all LLM call statistics? This cannot be undone.")) return;
		setClearing(true);
		try {
			await clearLlmStats();
			await load(filterIdx);
		} catch (e) {
			setError(String(e));
		} finally {
			setClearing(false);
		}
	}

	return (
		<div>
			{/* Controls row */}
			<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" as const }}>
				{TIME_FILTERS.map((f, i) => (
					<button
						key={f.label}
						onClick={() => setFilterIdx(i)}
						style={{
							...filterBtnBase,
							background: filterIdx === i ? "#228be6" : "rgba(255,255,255,0.06)",
							color: filterIdx === i ? "#fff" : "rgba(255,255,255,0.6)",
							borderColor: filterIdx === i ? "#228be6" : "rgba(255,255,255,0.1)",
						}}
					>
						{f.label}
					</button>
				))}
				<button
					onClick={() => load(filterIdx)}
					disabled={loading}
					style={{ ...filterBtnBase, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)", marginLeft: "auto" }}
				>
					{loading ? "Loading…" : "Refresh"}
				</button>
				<button
					onClick={handleClear}
					disabled={clearing}
					style={{
						...filterBtnBase,
						background: "rgba(255,107,107,0.08)",
						color: "#ff8f8f",
						borderColor: "rgba(255,107,107,0.2)",
					}}
				>
					{clearing ? "Clearing…" : "Clear stats"}
				</button>
			</div>

			{error && (
				<p style={{ fontSize: 12, color: "#ff8f8f", marginBottom: 10 }}>{error}</p>
			)}

			{/* Totals summary row */}
			{totals && (
				<div style={{
					display: "grid",
					gridTemplateColumns: "repeat(5, 1fr)",
					gap: 8,
					marginBottom: 16,
				}}>
					{[
						["Total calls", fmtNum(totals.totalCalls)],
						["Success rate", fmtPct(totals.totalSuccess, totals.totalCalls)],
						["Avg duration", fmtMs(totals.avgWallMs)],
						["Prompt tokens", fmtNum(totals.totalPromptTokens)],
						["Completion tokens", fmtNum(totals.totalCompletionTokens)],
					].map(([lbl, val]) => (
						<div key={lbl} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px" }}>
							<div style={{ fontSize: 18, fontWeight: 700, color: "#74c0fc" }}>{val}</div>
							<div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{lbl}</div>
						</div>
					))}
				</div>
			)}

			{/* Summary table grouped by model + operation */}
			{summary && summary.length > 0 ? (
				<div style={{ overflowX: "auto" as const, marginBottom: 16 }}>
					<table style={tableStyle}>
						<thead>
							<tr>
								<th style={thStyle}>Model</th>
								<th style={thStyle}>Operation</th>
								<th style={thStyle}>Calls</th>
								<th style={thStyle}>Success%</th>
								<th style={thStyle}>Avg ms</th>
								<th style={thStyle}>Avg tokens</th>
								<th style={thStyle}>Tokens/sec</th>
							</tr>
						</thead>
						<tbody>
							{summary.map((row) => (
								<tr key={`${row.model}:${row.operation}`}>
									<td style={{ ...tdStyle, color: "#74c0fc", fontFamily: "monospace" }}>{row.model}</td>
									<td style={{ ...tdStyle, color: "rgba(255,255,255,0.55)" }}>{row.operation}</td>
									<td style={tdStyle}>{row.calls}</td>
									<td style={{ ...tdStyle, color: row.successCalls === row.calls ? "#51cf66" : "#ff8f8f" }}>
										{fmtPct(row.successCalls, row.calls)}
									</td>
									<td style={tdStyle}>{fmtMs(row.avgWallMs)}</td>
									<td style={tdStyle}>{fmtNum(row.avgCompletionTokens)}</td>
									<td style={{ ...tdStyle, color: "rgba(255,255,255,0.5)" }}>
										{fmtTokensPerSec(row.avgCompletionTokens, row.avgEvalMs)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				!loading && (
					<p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
						No LLM calls recorded yet. Stats are collected when IMPACT_LLM=1 and Ollama calls are made.
					</p>
				)
			)}

			{/* Recent calls expandable section */}
			{recentCalls && recentCalls.length > 0 && (
				<div>
					<button
						onClick={() => setShowRecent((v) => !v)}
						style={{
							background: "none",
							border: "none",
							cursor: "pointer",
							color: "rgba(255,255,255,0.5)",
							fontSize: 12,
							padding: "4px 0",
							display: "flex",
							alignItems: "center",
							gap: 6,
							marginBottom: 8,
						}}
					>
						<span style={{ fontSize: 10 }}>{showRecent ? "▼" : "▶"}</span>
						Recent calls ({recentCalls.length})
					</button>

					{showRecent && (
						<div style={{ overflowX: "auto" as const }}>
							<table style={tableStyle}>
								<thead>
									<tr>
										<th style={thStyle}>Time</th>
										<th style={thStyle}>Operation</th>
										<th style={thStyle}>URL</th>
										<th style={thStyle}>Model</th>
										<th style={thStyle}>Prompt chars</th>
										<th style={thStyle}>Tokens</th>
										<th style={thStyle}>Duration</th>
										<th style={thStyle}>Status</th>
									</tr>
								</thead>
								<tbody>
									{recentCalls.map((call) => (
										<tr key={call.id}>
											<td style={{ ...tdStyle, color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: 11 }}>
												{fmtTime(call.createdAt)}
											</td>
											<td style={{ ...tdStyle, color: "rgba(255,255,255,0.6)" }}>{call.operation}</td>
											<td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden" as const, textOverflow: "ellipsis" as const }}>
												<span title={call.url ?? undefined} style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
													{truncateUrl(call.url)}
												</span>
											</td>
											<td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, color: "#74c0fc" }}>{call.model}</td>
											<td style={tdStyle}>{call.promptChars.toLocaleString()}</td>
											<td style={tdStyle}>{call.completionTokens != null ? call.completionTokens : "—"}</td>
											<td style={tdStyle}>{fmtMs(call.wallDurationMs)}</td>
											<td style={tdStyle}>
												{call.success ? (
													<span style={{ color: "#51cf66", fontSize: 11, fontWeight: 600 }}>ok</span>
												) : (
													<span style={{ color: "#ff8f8f", fontSize: 11, fontWeight: 600 }} title={call.error ?? undefined}>
														fail
													</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
