import { useState, useEffect } from "preact/hooks";
import { browseRegistry, importFromRegistry } from "../lib/api.js";
import type { RegistryEntry } from "../lib/api.js";
import { relativeTime } from "../lib/format.js";

const inputStyle = {
	background: "rgba(255,255,255,0.06)",
	border: "1px solid rgba(255,255,255,0.1)",
	borderRadius: "8px",
	color: "#e2e8f0",
	fontSize: 13,
	padding: "8px 12px",
	outline: "none",
	width: "100%",
	boxSizing: "border-box" as const,
};

const entryCard = {
	background: "rgba(255,255,255,0.04)",
	border: "1px solid rgba(255,255,255,0.07)",
	borderRadius: 8,
	padding: "12px 14px",
	display: "flex",
	flexDirection: "column" as const,
	gap: 6,
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

	useEffect(() => {
		load();
	}, []);

	async function handleSearch(e: Event) {
		e.preventDefault();
		await load(q);
	}

	async function handleImport(entry: RegistryEntry) {
		setImporting(entry.id);
		try {
			const result = await importFromRegistry(entry.id);
			setImportResult((prev) => ({
				...prev,
				[entry.id]: `Imported ${result.imported.promptConfigs} prompt configs, ${result.imported.pluginConfigs} plugin configs`,
			}));
		} catch (e) {
			setImportResult((prev) => ({ ...prev, [entry.id]: `Error: ${String(e)}` }));
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
				<button
					type="submit"
					style={{
						padding: "8px 14px",
						background: "#228be6",
						color: "white",
						border: "none",
						borderRadius: 8,
						cursor: "pointer",
						fontSize: 13,
						flexShrink: 0,
					}}
				>
					Search
				</button>
			</form>

			{loading && (
				<p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Loading registry…</p>
			)}

			{error && (
				<p style={{ fontSize: 13, color: "#ff8f8f" }}>
					Could not reach registry: {error}
				</p>
			)}

			{!loading && !error && entries.length === 0 && (
				<p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
					No entries found{q ? ` for "${q}"` : ""}.
				</p>
			)}

			{entries.map((entry) => (
				<div key={entry.id} style={entryCard}>
					<div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>
								{entry.label}
							</div>
							<div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
								{entry.domain} · pushed {relativeTime(entry.pushedAt)} · {entry.pushCount} push{entry.pushCount !== 1 ? "es" : ""}
								{entry.contributor !== "anonymous" && ` · by ${entry.contributor}`}
							</div>
							{entry.description && (
								<div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 5, lineHeight: 1.5 }}>
									{entry.description}
								</div>
							)}
						</div>
						<button
							onClick={() => handleImport(entry)}
							disabled={importing === entry.id}
							style={{
								padding: "6px 12px",
								background: importing === entry.id ? "rgba(34,139,230,0.3)" : "rgba(34,139,230,0.15)",
								color: "#74c0fc",
								border: "1px solid rgba(34,139,230,0.3)",
								borderRadius: 6,
								cursor: importing === entry.id ? "default" : "pointer",
								fontSize: 12,
								fontWeight: 600,
								flexShrink: 0,
							}}
						>
							{importing === entry.id ? "Importing…" : "Import"}
						</button>
					</div>

					{importResult[entry.id] && (
						<div
							style={{
								fontSize: 12,
								color: importResult[entry.id].startsWith("Error") ? "#ff8f8f" : "#51cf66",
								padding: "4px 8px",
								background: importResult[entry.id].startsWith("Error")
									? "rgba(255,107,107,0.08)"
									: "rgba(81,207,102,0.08)",
								borderRadius: 4,
							}}
						>
							{importResult[entry.id]}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
