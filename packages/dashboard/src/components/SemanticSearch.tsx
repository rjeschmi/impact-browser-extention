import { useState, useEffect } from "preact/hooks";
import { searchSnapshots, reindexSnapshots } from "../lib/api.js";
import { BACKEND_URL } from "@impact/shared";

type SearchResult = {
	url: string;
	domain: string;
	version: string;
	data: string;
	score: number;
};

type IndexStats = { total: number; indexed: number } | null;

function parseData(raw: string): Record<string, unknown> {
	try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

function ScoreBar({ score }: { score: number }) {
	const pct = Math.round(score * 100);
	const color = pct >= 70 ? "#51cf66" : pct >= 50 ? "#ffd43b" : "#ff922b";
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
			<div style={{ width: 60, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
				<div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
			</div>
			<span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36 }}>{pct}%</span>
		</div>
	);
}

function ResultCard({ r }: { r: SearchResult }) {
	const data = parseData(r.data);
	const title = (data.title ?? data.name ?? r.domain) as string;
	const summary = (data.summary ?? data.description) as string | undefined;
	const price = data.price != null ? `${data.currency ?? ""} ${data.price}`.trim() : undefined;

	// Collect other notable fields
	const skip = new Set(["title", "name", "summary", "description", "price", "currency", "version"]);
	const extras = Object.entries(data)
		.filter(([k, v]) => !skip.has(k) && (typeof v === "string" || typeof v === "number") && v !== "")
		.slice(0, 3);

	return (
		<div style={{
			background: "#1e2d50", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)",
			padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
		}}>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontSize: 14, fontWeight: 700, color: "white", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{title}
					</div>
					<div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
						{r.domain} · v{r.version}
					</div>
				</div>
				<ScoreBar score={r.score} />
			</div>

			{summary && (
				<p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.55, margin: 0,
					display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
					{summary}
				</p>
			)}

			{(price || extras.length > 0) && (
				<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
					{price && (
						<span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "rgba(81,207,102,0.12)", color: "#51cf66", fontWeight: 600 }}>
							{price}
						</span>
					)}
					{extras.map(([k, v]) => (
						<span key={k} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
							{k}: {String(v).slice(0, 40)}
						</span>
					))}
				</div>
			)}

			<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<a href={r.url} target="_blank" rel="noopener noreferrer"
					style={{ fontSize: 12, color: "#74c0fc", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
					{r.url}
				</a>
				<a href={`/?domain=${encodeURIComponent(r.domain)}&url=${encodeURIComponent(r.url)}`}
					style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
					Site →
				</a>
			</div>
		</div>
	);
}

export function SemanticSearch() {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [totalIndexed, setTotalIndexed] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searched, setSearched] = useState(false);
	const [indexing, setIndexing] = useState(false);
	const [indexResult, setIndexResult] = useState<{ indexed: number; total: number } | null>(null);
	const [indexStats, setIndexStats] = useState<IndexStats>(null);

	// Load index stats on mount
	useEffect(() => {
		fetch(`${BACKEND_URL}/api/snapshots/search?q=_&min_score=0`)
			.then(r => r.json())
			.then((d: { totalIndexed?: number }) => {
				if (typeof d.totalIndexed === "number") setIndexStats({ indexed: d.totalIndexed, total: d.totalIndexed });
			})
			.catch(() => {});
	}, [indexResult]);

	async function handleSearch(e: Event) {
		e.preventDefault();
		if (!query.trim()) return;
		setLoading(true);
		setError(null);
		try {
			const data = await searchSnapshots(query.trim(), 15, 0.3);
			setResults(data.results);
			setTotalIndexed(data.totalIndexed);
			setSearched(true);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Search failed";
			setError(msg);
		} finally {
			setLoading(false);
		}
	}

	async function handleReindex(force: boolean) {
		setIndexing(true);
		setIndexResult(null);
		try {
			const result = await reindexSnapshots(force);
			setIndexResult(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Reindex failed");
		} finally {
			setIndexing(false);
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

			{/* Search bar */}
			<div>
				<h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: "white" }}>Semantic Search</h2>
				<p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
					Search across your saved snapshots by meaning, not just keywords.
					{totalIndexed !== null && <span> {totalIndexed} snapshot{totalIndexed !== 1 ? "s" : ""} indexed.</span>}
				</p>
				<form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
					<input
						type="text"
						value={query}
						onInput={e => setQuery((e.target as HTMLInputElement).value)}
						placeholder="e.g. laptop bags under $400, upcoming deadlines, research about climate…"
						style={{
							flex: 1, padding: "10px 14px", borderRadius: 8,
							border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)",
							color: "#e2e8f0", fontSize: 14, outline: "none",
						}}
					/>
					<button type="submit" disabled={loading || !query.trim()} style={{
						padding: "10px 22px", borderRadius: 8, border: "none", background: "#228be6",
						color: "white", fontSize: 14, fontWeight: 600,
						cursor: loading || !query.trim() ? "not-allowed" : "pointer", opacity: loading || !query.trim() ? 0.7 : 1,
						flexShrink: 0,
					}}>
						{loading ? "Searching…" : "Search"}
					</button>
				</form>
			</div>

			{/* Error */}
			{error && (
				<div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#ff8f8f" }}>
					{error}
				</div>
			)}

			{/* Results */}
			{searched && !loading && (
				results.length === 0 ? (
					<div style={{ background: "#1e2d50", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", padding: "32px 20px", textAlign: "center" }}>
						<div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>No results above 30% match</div>
						<div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
							Try a different query, or lower the threshold.
							{totalIndexed === 0 && " No snapshots are indexed — use the reindex tool below."}
						</div>
					</div>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
						<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
							{results.length} result{results.length !== 1 ? "s" : ""}
						</div>
						{results.map(r => <ResultCard key={r.url} r={r} />)}
					</div>
				)
			)}

			{/* Reindex panel */}
			<div style={{ background: "#1e2d50", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", padding: "16px 18px" }}>
				<div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase", marginBottom: 10 }}>
					Embedding Index
				</div>
				<p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 14, lineHeight: 1.6 }}>
					Embeddings are generated automatically when you commit a snapshot (requires <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>IMPACT_LLM=1</code> and Ollama running with <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>embeddinggemma</code>).
					Use the buttons below to index existing snapshots that were committed before embeddings were enabled.
				</p>
				{indexResult && (
					<div style={{ fontSize: 12, color: "#51cf66", marginBottom: 12 }}>
						✓ Indexed {indexResult.indexed} of {indexResult.total} snapshots
					</div>
				)}
				<div style={{ display: "flex", gap: 8 }}>
					<button onClick={() => handleReindex(false)} disabled={indexing} style={{
						padding: "8px 16px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.15)",
						background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", fontSize: 13,
						cursor: indexing ? "not-allowed" : "pointer", opacity: indexing ? 0.6 : 1,
					}}>
						{indexing ? "Indexing…" : "Index missing"}
					</button>
					<button onClick={() => handleReindex(true)} disabled={indexing} style={{
						padding: "8px 16px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
						background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13,
						cursor: indexing ? "not-allowed" : "pointer", opacity: indexing ? 0.6 : 1,
					}}>
						Re-index all
					</button>
				</div>
			</div>
		</div>
	);
}
