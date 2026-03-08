import { useState, useEffect } from "preact/hooks";
import { browseRegistry, browseRegistryEntry, importFromRegistry } from "../lib/api.js";
import type { RegistryEntry } from "../lib/api.js";
import { relativeTime } from "../lib/format.js";

const SKIP_KEYS = new Set(["promptUsed", "chunksProcessed", "_cleanupApplied", "_originalCount", "_cleanedCount", "version"]);

const QUALITY_STYLE: Record<string, { color: string; bg: string }> = {
	ok:      { color: "#51cf66", bg: "rgba(81,207,102,0.12)" },
	partial: { color: "#ffd43b", bg: "rgba(255,212,59,0.12)" },
	invalid: { color: "rgba(255,255,255,0.25)", bg: "rgba(255,255,255,0.05)" },
};

function QualityBadge({ q }: { q: string }) {
	const s = QUALITY_STYLE[q] ?? { color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.06)" };
	return (
		<span style={{
			fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
			color: s.color, background: s.bg, textTransform: "uppercase" as const,
			letterSpacing: "0.05em", whiteSpace: "nowrap" as const, flexShrink: 0,
		}}>
			{q}
		</span>
	);
}

/** Render an array of objects as a table */
function ObjectTable({ rows }: { rows: Record<string, unknown>[] }) {
	// Collect all keys preserving insertion order, _quality last
	const keySet = new Set<string>();
	for (const row of rows) {
		for (const k of Object.keys(row)) {
			if (k !== "_quality") keySet.add(k);
		}
	}
	const hasQuality = rows.some(r => "_quality" in r);
	const keys = [...keySet];
	const preview = rows.slice(0, 50);
	const overflow = rows.length - preview.length;

	return (
		<div style={{ overflowX: "auto" as const }}>
			<table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
				<thead>
					<tr>
						{hasQuality && <th style={thStyle}>quality</th>}
						{keys.map(k => <th key={k} style={thStyle}>{k}</th>)}
					</tr>
				</thead>
				<tbody>
					{preview.map((row, i) => {
						const q = row._quality as string | undefined;
						const dim = q === "invalid";
						return (
							<tr key={i} style={{ opacity: dim ? 0.4 : 1 }}>
								{hasQuality && (
									<td style={tdStyle}>
										{q ? <QualityBadge q={q} /> : null}
									</td>
								)}
								{keys.map(k => (
									<td key={k} style={tdStyle}>
										{formatCell(row[k])}
									</td>
								))}
							</tr>
						);
					})}
				</tbody>
			</table>
			{overflow > 0 && (
				<div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "6px 4px" }}>
					+ {overflow} more rows not shown
				</div>
			)}
		</div>
	);
}

function formatCell(v: unknown): string {
	if (v === null || v === undefined) return "—";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	return JSON.stringify(v);
}

const thStyle = {
	padding: "5px 10px", textAlign: "left" as const,
	fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)",
	textTransform: "uppercase" as const, letterSpacing: "0.05em",
	borderBottom: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" as const,
};
const tdStyle = {
	padding: "5px 10px", color: "rgba(255,255,255,0.65)",
	borderBottom: "1px solid rgba(255,255,255,0.04)", verticalAlign: "top" as const,
	maxWidth: 260, overflow: "hidden" as const, textOverflow: "ellipsis" as const,
	whiteSpace: "nowrap" as const,
};

/** Generic renderer for any sample data shape */
function SampleDataViewer({ raw }: { raw: string }) {
	let data: Record<string, unknown>;
	try { data = JSON.parse(raw) as Record<string, unknown>; }
	catch { return <pre style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "pre-wrap" }}>{raw.slice(0, 2000)}</pre>; }

	const entries = Object.entries(data).filter(([k]) => !SKIP_KEYS.has(k));
	if (entries.length === 0) return <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>No displayable data.</p>;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
			{entries.map(([key, value]) => (
				<div key={key}>
					<div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
						{key}
					</div>
					{Array.isArray(value) ? (
						value.length === 0 ? (
							<span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>empty</span>
						) : typeof value[0] === "object" && value[0] !== null ? (
							<ObjectTable rows={value as Record<string, unknown>[]} />
						) : (
							<ul style={{ margin: 0, padding: "0 0 0 16px", display: "flex", flexDirection: "column", gap: 2 }}>
								{(value as unknown[]).slice(0, 50).map((item, i) => (
									<li key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{String(item)}</li>
								))}
							</ul>
						)
					) : (
						<span style={{ fontSize: 13, color: "#e2e8f0" }}>{formatCell(value)}</span>
					)}
				</div>
			))}
		</div>
	);
}

/** Expandable section that lazily fetches sampleData */
function EntryDataExpander({ entryId }: { entryId: number }) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [sampleData, setSampleData] = useState<string | null>(null);
	const [fetchError, setFetchError] = useState<string | null>(null);

	async function handleOpen() {
		setOpen(true);
		if (sampleData !== null || fetchError) return;
		setLoading(true);
		try {
			const full = await browseRegistryEntry(entryId);
			setSampleData(full.sampleData ?? null);
		} catch (e) {
			setFetchError(String(e));
		} finally {
			setLoading(false);
		}
	}

	return (
		<div>
			<button
				onClick={open ? () => setOpen(false) : handleOpen}
				style={{
					background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5,
					padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
					color: "rgba(255,255,255,0.35)", letterSpacing: "0.05em", textTransform: "uppercase",
				}}
			>
				{open ? "Hide data" : "View data"}
			</button>

			{open && (
				<div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(0,0,0,0.2)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.06)" }}>
					{loading && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>Loading…</p>}
					{fetchError && <p style={{ fontSize: 12, color: "#ff8f8f", margin: 0 }}>{fetchError}</p>}
					{!loading && !fetchError && !sampleData && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>No sample data stored for this entry.</p>}
					{sampleData && <SampleDataViewer raw={sampleData} />}
				</div>
			)}
		</div>
	);
}

const inputStyle = {
	background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
	borderRadius: "8px", color: "#e2e8f0", fontSize: 13, padding: "8px 12px",
	outline: "none", width: "100%", boxSizing: "border-box" as const,
};
const entryCard = {
	background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
	borderRadius: 8, padding: "12px 14px", display: "flex",
	flexDirection: "column" as const, gap: 8,
};

export function RegistryBrowser() {
	const [entries, setEntries] = useState<RegistryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [q, setQ] = useState("");
	const [importing, setImporting] = useState<number | null>(null);
	const [importResult, setImportResult] = useState<Record<number, string>>({});

	async function load(query?: string) {
		setLoading(true);
		setError(null);
		try {
			const data = await browseRegistry(query || undefined);
			setEntries(data.entries);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => { load(); }, []);

	async function handleSearch(e: Event) {
		e.preventDefault();
		await load(q);
	}

	async function handleImport(entry: RegistryEntry) {
		setImporting(entry.id);
		try {
			const result = await importFromRegistry(entry.id);
			setImportResult(prev => ({
				...prev,
				[entry.id]: `Imported ${result.imported.promptConfigs} prompt configs, ${result.imported.pluginConfigs} plugin configs`,
			}));
		} catch (e) {
			setImportResult(prev => ({ ...prev, [entry.id]: `Error: ${String(e)}` }));
		} finally {
			setImporting(null);
		}
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			<form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
				<input
					type="text"
					placeholder="Search by label, domain, or description…"
					value={q}
					onInput={(e) => setQ((e.target as HTMLInputElement).value)}
					style={{ ...inputStyle, flex: 1 }}
				/>
				<button type="submit" style={{
					padding: "8px 14px", background: "#228be6", color: "white",
					border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, flexShrink: 0,
				}}>
					Search
				</button>
			</form>

			{loading && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading registry…</p>}
			{error && <p style={{ fontSize: 13, color: "#ff8f8f" }}>Could not reach registry: {error}</p>}
			{!loading && !error && entries.length === 0 && (
				<p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>No entries found{q ? ` for "${q}"` : ""}.</p>
			)}

			{entries.map(entry => (
				<div key={entry.id} style={entryCard}>
					<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{entry.label}</div>
							<div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
								{entry.domain} · pushed {relativeTime(entry.pushedAt)} · {entry.pushCount} push{entry.pushCount !== 1 ? "es" : ""}
								{entry.contributor !== "anonymous" && ` · by ${entry.contributor}`}
							</div>
							{entry.description && (
								<div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.5 }}>{entry.description}</div>
							)}
						</div>
						<button
							onClick={() => handleImport(entry)}
							disabled={importing === entry.id}
							style={{
								padding: "6px 12px", fontSize: 12, fontWeight: 600, flexShrink: 0,
								background: importing === entry.id ? "rgba(34,139,230,0.3)" : "rgba(34,139,230,0.15)",
								color: "#74c0fc", border: "1px solid rgba(34,139,230,0.3)",
								borderRadius: 6, cursor: importing === entry.id ? "default" : "pointer",
							}}
						>
							{importing === entry.id ? "Importing…" : "Import"}
						</button>
					</div>

					<EntryDataExpander entryId={entry.id} />

					{importResult[entry.id] && (
						<div style={{
							fontSize: 12, padding: "4px 8px", borderRadius: 4,
							color: importResult[entry.id].startsWith("Error") ? "#ff8f8f" : "#51cf66",
							background: importResult[entry.id].startsWith("Error") ? "rgba(255,107,107,0.08)" : "rgba(81,207,102,0.08)",
						}}>
							{importResult[entry.id]}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
