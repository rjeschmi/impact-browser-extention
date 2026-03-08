import { useState, useEffect, useCallback } from "preact/hooks";
import { getSnapshotForUrl, commitSnapshotById, reextractSnapshot, getSnapshotHtml, getPluginConfigs, createPluginConfig, updatePluginConfig, deletePluginConfig, getPluginLogs } from "../lib/api.js";
import type { PluginConfig } from "../lib/api.js";

const card = { background: "#1e2d50", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)", padding: "18px 20px" };
const sectionTitle = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, marginBottom: 10 };

type FieldStatus = "added" | "removed" | "changed" | "unchanged";

interface DiffEntry {
	key: string;
	status: FieldStatus;
	oldVal?: unknown;
	newVal?: unknown;
}

function diffObjects(committed: Record<string, unknown>, pending: Record<string, unknown>): DiffEntry[] {
	const keys = new Set([...Object.keys(committed), ...Object.keys(pending)]);
	const entries: DiffEntry[] = [];
	for (const key of keys) {
		if (key === "version") continue;
		const inOld = key in committed;
		const inNew = key in pending;
		if (!inOld) {
			entries.push({ key, status: "added", newVal: pending[key] });
		} else if (!inNew) {
			entries.push({ key, status: "removed", oldVal: committed[key] });
		} else if (JSON.stringify(committed[key]) !== JSON.stringify(pending[key])) {
			entries.push({ key, status: "changed", oldVal: committed[key], newVal: pending[key] });
		} else {
			entries.push({ key, status: "unchanged", newVal: pending[key] });
		}
	}
	return entries.sort((a, b) => {
		const order: Record<FieldStatus, number> = { added: 0, changed: 1, removed: 2, unchanged: 3 };
		return order[a.status] - order[b.status];
	});
}

function formatVal(v: unknown): string {
	if (v === null || v === undefined) return "—";
	if (typeof v === "string") return v;
	return JSON.stringify(v, null, 2);
}

const STATUS_COLORS: Record<FieldStatus, { bg: string; border: string; badge: string; badgeBg: string }> = {
	added:     { bg: "rgba(81,207,102,0.07)",  border: "rgba(81,207,102,0.25)",   badge: "#51cf66", badgeBg: "rgba(81,207,102,0.15)" },
	removed:   { bg: "rgba(255,107,107,0.07)", border: "rgba(255,107,107,0.25)",  badge: "#ff6b6b", badgeBg: "rgba(255,107,107,0.15)" },
	changed:   { bg: "rgba(255,212,59,0.06)",  border: "rgba(255,212,59,0.25)",   badge: "#ffd43b", badgeBg: "rgba(255,212,59,0.12)" },
	unchanged: { bg: "transparent",            border: "rgba(255,255,255,0.05)",  badge: "rgba(255,255,255,0.3)", badgeBg: "rgba(255,255,255,0.05)" },
};

function DiffRow({ entry, isRejected, onToggle }: {
	entry: DiffEntry;
	isRejected?: boolean;
	onToggle?: () => void;
}) {
	const c = STATUS_COLORS[entry.status];
	const canToggle = entry.status !== "unchanged" && !!onToggle;
	return (
		<div style={{
			padding: "10px 14px", background: c.bg, borderRadius: 8,
			border: `1px solid ${c.border}`, display: "flex", gap: 14, alignItems: "flex-start",
			opacity: isRejected ? 0.4 : 1, transition: "opacity 0.15s",
		}}>
			<span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: c.badgeBg, color: c.badge, flexShrink: 0, marginTop: 2, textTransform: "uppercase" }}>
				{entry.status}
			</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>{entry.key}</div>
				{entry.status === "changed" && (
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<div style={{ fontSize: 12, color: "#ff8f8f", textDecoration: isRejected ? "none" : "line-through", opacity: 0.7, wordBreak: "break-word" }}>{formatVal(entry.oldVal)}</div>
						{!isRejected && <div style={{ fontSize: 13, color: "#e2e8f0", wordBreak: "break-word" }}>{formatVal(entry.newVal)}</div>}
					</div>
				)}
				{entry.status === "removed" && (
					<div style={{ fontSize: 12, color: "#ff8f8f", opacity: 0.7, wordBreak: "break-word" }}>{formatVal(entry.oldVal)}</div>
				)}
				{(entry.status === "added" || entry.status === "unchanged") && (
					<div style={{ fontSize: 13, color: "#e2e8f0", wordBreak: "break-word" }}>{formatVal(entry.newVal)}</div>
				)}
			</div>
			{canToggle && (
				<button onClick={onToggle} title={isRejected ? "Click to accept this change" : "Click to reject this change"} style={{
					flexShrink: 0, background: "none", border: "1px solid rgba(255,255,255,0.12)",
					borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontSize: 11,
					color: isRejected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
					marginTop: 2,
				}}>
					{isRejected ? "excluded" : "✓ included"}
				</button>
			)}
		</div>
	);
}

export function SnapshotDiff({ url, domain }: { url: string; domain: string }) {
	const [loading, setLoading] = useState(true);
	const [committed, setCommitted] = useState<{ id: number; version: string; data: Record<string, unknown>; committedAt: number | null } | null>(null);
	const [pending, setPending] = useState<{ id: number; version: string; data: Record<string, unknown> } | null>(null);
	const [pageText, setPageText] = useState<string | null>(null);
	const [rawContentOpen, setRawContentOpen] = useState(false);
	const [rawContentTab, setRawContentTab] = useState<"text" | "cheerio">("text");
	const [cheerioHtml, setCheerioHtml] = useState<string | null>(null);
	const [cheerioLoading, setCheerioLoading] = useState(false);
	const [committing, setCommitting] = useState(false);
	const [rerunning, setRerunning] = useState(false);
	const [done, setDone] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [rejected, setRejected] = useState<Set<string>>(new Set());

	useEffect(() => {
		getSnapshotForUrl(url)
			.then(snap => {
				setCommitted(snap.committed ? { ...snap.committed, data: JSON.parse(snap.committed.data) as Record<string, unknown> } : null);
				setPending(snap.pending ? { ...snap.pending, data: JSON.parse(snap.pending.data) as Record<string, unknown> } : null);
				setPageText(snap.pending?.pageText ?? snap.committed?.pageText ?? null);
			})
			.catch(e => setError(String(e)))
			.finally(() => setLoading(false));
	}, [url]);

	const refresh = useCallback(async () => {
		const snap = await getSnapshotForUrl(url);
		setCommitted(snap.committed ? { ...snap.committed, data: JSON.parse(snap.committed.data) as Record<string, unknown> } : null);
		setPending(snap.pending ? { ...snap.pending, data: JSON.parse(snap.pending.data) as Record<string, unknown> } : null);
		setPageText(snap.pending?.pageText ?? snap.committed?.pageText ?? null);
		setDone(false);
		setRejected(new Set());
	}, [url]);

	const toggleRejected = useCallback((key: string) => {
		setRejected(prev => {
			const next = new Set(prev);
			next.has(key) ? next.delete(key) : next.add(key);
			return next;
		});
	}, []);

	const buildMergedData = useCallback((
		committedData: Record<string, unknown>,
		pendingData: Record<string, unknown>,
		entries: DiffEntry[],
	): Record<string, unknown> => {
		const merged = { ...committedData };
		for (const entry of entries) {
			if (entry.status === "unchanged") continue;
			const isRejected = rejected.has(entry.key);
			if (isRejected) continue; // keep committed value (or absence)
			if (entry.status === "added")   merged[entry.key] = pendingData[entry.key];
			if (entry.status === "changed") merged[entry.key] = pendingData[entry.key];
			if (entry.status === "removed") delete merged[entry.key];
		}
		return merged;
	}, [rejected]);

	const commit = async (diffEntries: DiffEntry[]) => {
		if (!pending) return;
		setCommitting(true);
		try {
			const mergedData = buildMergedData(committed?.data ?? {}, pending.data, diffEntries);
			await commitSnapshotById(pending.id, mergedData);
			setDone(true);
			setPending(null);
			const snap = await getSnapshotForUrl(url);
			if (snap.committed) setCommitted({ ...snap.committed, data: JSON.parse(snap.committed.data) as Record<string, unknown> });
		} catch (e) {
			setError(String(e));
		} finally {
			setCommitting(false);
		}
	};

	const rerun = async () => {
		setRerunning(true);
		setError(null);
		try {
			await reextractSnapshot(url);
			await refresh();
		} catch (e) {
			setError(String(e));
		} finally {
			setRerunning(false);
		}
	};

	const switchToCheerioTab = useCallback(async () => {
		setRawContentTab("cheerio");
		if (cheerioHtml !== null) return;
		setCheerioLoading(true);
		try {
			const result = await getSnapshotHtml(url);
			setCheerioHtml(result.structuredContent ?? (result.hasHtml ? "(cheerio returned empty content)" : "(no HTML stored — take a new snapshot from the extension)"));
		} catch (e) {
			setCheerioHtml(`Error: ${String(e)}`);
		} finally {
			setCheerioLoading(false);
		}
	}, [url, cheerioHtml]);

	if (loading) return <p style={{ color: "rgba(255,255,255,0.35)", padding: 28 }}>Loading snapshot…</p>;
	if (error) return <div style={{ ...card, color: "#ff8f8f" }}>Error: {error}</div>;

	const title = (pending?.data.title ?? committed?.data.title ?? url) as string;

	// No data at all
	if (!committed && !pending) {
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				<Header url={url} domain={domain} title={title} />
				<div style={{ ...card, textAlign: "center", padding: 40 }}>
					<p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>No snapshot data for this page yet.</p>
					<p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginTop: 8 }}>Open the extension popup and click "Show differences" while on this page.</p>
				</div>
			</div>
		);
	}

	// Auto-committed (no pending, first time)
	if (committed && !pending && done) {
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				<Header url={url} domain={domain} title={title} />
				<div style={{ ...card, textAlign: "center", padding: 32 }}>
					<div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
					<p style={{ color: "#51cf66", fontSize: 15, fontWeight: 600 }}>Saved as v{committed.version}</p>
				</div>
				<SnapshotCard title="Saved Data" data={committed.data} version={committed.version} />
			</div>
		);
	}

	// No pending — data is up to date
	if (committed && !pending) {
		return (
			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				<Header url={url} domain={domain} title={title} />
				<div style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "14px 20px" }}>
					<span style={{ width: 8, height: 8, borderRadius: "50%", background: "#51cf66", display: "inline-block", flexShrink: 0 }} />
					<span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", flex: 1 }}>No changes — current data matches committed v{committed.version}</span>
					<button onClick={rerun} disabled={rerunning} style={{
						background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)",
						border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7,
						padding: "6px 12px", fontSize: 12, cursor: rerunning ? "default" : "pointer",
						opacity: rerunning ? 0.6 : 1, flexShrink: 0,
					}}>
						{rerunning ? "Running…" : "↺ Rerun extraction"}
					</button>
				</div>
				<SnapshotCard title="Current Snapshot" data={committed.data} version={committed.version} />
				<PluginLogsViewer snapshotId={committed.id} />
				<CheerioSettings url={url} onSaved={() => {}} />
			</div>
		);
	}

	// Has pending — show diff
	const diffEntries = committed
		? diffObjects(committed.data, pending!.data)
		: Object.entries(pending!.data).filter(([k]) => k !== "version").map(([k, v]) => ({ key: k, status: "added" as FieldStatus, newVal: v }));

	const changedCount = diffEntries.filter(e => e.status !== "unchanged").length;
	const toggleableKeys = diffEntries.filter(e => e.status !== "unchanged").map(e => e.key);
	const allExcluded = toggleableKeys.length > 0 && toggleableKeys.every(k => rejected.has(k));

	const toggleAll = useCallback(() => {
		if (allExcluded) {
			setRejected(new Set());
		} else {
			setRejected(new Set(toggleableKeys));
		}
	}, [allExcluded, toggleableKeys.join(",")]);

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
			<Header url={url} domain={domain} title={title} />

			{/* Summary bar */}
			<div style={{ ...card, display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
				<span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff6b6b", display: "inline-block", flexShrink: 0 }} />
				<div style={{ flex: 1 }}>
					<span style={{ fontSize: 13, color: "white", fontWeight: 600 }}>
						{committed ? `${changedCount} change${changedCount !== 1 ? "s" : ""} detected` : "First snapshot"}
					</span>
					<span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginLeft: 10 }}>
						{committed ? `v${committed.version} → v${pending!.version}` : `v${pending!.version}`}
					</span>
				</div>
				<div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
					<button
						onClick={rerun}
						disabled={rerunning || committing}
						style={{
							background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)",
							border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7,
							padding: "8px 14px", fontSize: 13, fontWeight: 500,
							cursor: rerunning || committing ? "default" : "pointer",
							opacity: rerunning || committing ? 0.6 : 1,
						}}>
						{rerunning ? "Running…" : "↺ Rerun"}
					</button>
					{done ? (
						<span style={{ fontSize: 13, color: "#51cf66", fontWeight: 600, alignSelf: "center" }}>✓ Saved</span>
					) : (
						<button
							onClick={() => commit(diffEntries)}
							disabled={committing || rerunning}
							style={{
								background: "#228be6", color: "white", border: "none", borderRadius: 7,
								padding: "8px 18px", fontSize: 13, fontWeight: 600,
								cursor: committing || rerunning ? "default" : "pointer",
								opacity: committing || rerunning ? 0.6 : 1,
							}}>
							{committing ? "Saving…" : "Save this version"}
						</button>
					)}
				</div>
			</div>

			{/* Diff */}
			<div style={card}>
				<div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<span>Changes</span>
					{toggleableKeys.length > 0 && (
						<button onClick={toggleAll} style={{
							background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
							padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
							color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", textTransform: "uppercase",
						}}>
							{allExcluded ? "Select all" : "Deselect all"}
						</button>
					)}
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{diffEntries.map(e => (
						<DiffRow
							key={e.key}
							entry={e}
							isRejected={rejected.has(e.key)}
							onToggle={e.status !== "unchanged" ? () => toggleRejected(e.key) : undefined}
						/>
					))}
				</div>
			</div>

			{/* Raw page content (tabs: plain text / cheerio HTML) */}
			{pageText && (
				<div style={card}>
					<div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: rawContentOpen ? 10 : 0 }}>
						<span>Raw page content</span>
						<button onClick={() => setRawContentOpen(o => !o)} style={{
							background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
							padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
							color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", textTransform: "uppercase",
						}}>
							{rawContentOpen ? "Hide" : "Show"}
						</button>
					</div>
					{rawContentOpen && (
						<>
							<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
								{(["text", "cheerio"] as const).map(tab => (
									<button
										key={tab}
										onClick={tab === "cheerio" ? switchToCheerioTab : () => setRawContentTab("text")}
										style={{
											background: rawContentTab === tab ? "rgba(255,255,255,0.12)" : "none",
											border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
											padding: "3px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600,
											color: rawContentTab === tab ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)",
										}}
									>
										{tab === "text" ? "Plain text" : "Cheerio HTML"}
									</button>
								))}
							</div>
							<pre style={{
								margin: 0, padding: "12px 14px", background: "rgba(0,0,0,0.25)", borderRadius: 7,
								border: "1px solid rgba(255,255,255,0.06)", fontSize: 12, lineHeight: 1.6,
								color: "rgba(255,255,255,0.55)", whiteSpace: "pre-wrap", wordBreak: "break-word",
								maxHeight: 400, overflowY: "auto",
							}}>
								{rawContentTab === "text"
									? pageText
									: cheerioLoading ? "Loading…" : (cheerioHtml ?? "(no HTML stored)")}
							</pre>
						</>
					)}
				</div>
			)}

			{/* Pipeline logs */}
			<PluginLogsViewer snapshotId={pending?.id ?? committed?.id ?? null} />

			{/* Cheerio settings */}
			<CheerioSettings url={url} onSaved={() => setCheerioHtml(null)} />
		</div>
	);
}

function Header({ url, domain, title }: { url: string; domain: string; title: string }) {
	return (
		<div style={{ ...card, padding: "14px 20px" }}>
			<div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
				<div style={{ minWidth: 0, flex: 1 }}>
					<div style={{ fontSize: 17, fontWeight: 700, color: "white", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
					<a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#74c0fc", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{url}</a>
				</div>
				<a
					href={`/?tab=settings&url=${encodeURIComponent(url)}`}
					style={{
						flexShrink: 0, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)",
						textDecoration: "none", padding: "4px 10px", borderRadius: 5,
						border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
						whiteSpace: "nowrap",
					}}
				>
					⚙ Prompt settings
				</a>
			</div>
		</div>
	);
}

function SnapshotCard({ title, data, version }: { title: string; data: Record<string, unknown>; version: string }) {
	return (
		<div style={card}>
			<div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between" }}>
				<span>{title}</span>
				<span style={{ color: "rgba(255,255,255,0.2)" }}>v{version}</span>
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
				{Object.entries(data).filter(([k]) => k !== "version").map(([k, v]) => (
					<div key={k} style={{ display: "flex", gap: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.05)" }}>
						<span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", flexShrink: 0, minWidth: 100 }}>{k}</span>
						<span style={{ fontSize: 13, color: "#e2e8f0", wordBreak: "break-word" }}>{formatVal(v)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
function CheerioSettings({ url, onSaved }: { url: string; onSaved: () => void }) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [existing, setExisting] = useState<PluginConfig | null>(null);
	const [contentSelector, setContentSelector] = useState("");
	const [stripTags, setStripTags] = useState("");
	const [maxChars, setMaxChars] = useState("32000");
	const [unlimitedChars, setUnlimitedChars] = useState(false);
	const [textOnly, setTextOnly] = useState(false);
	const [enabled, setEnabled] = useState(true);
	const [urlPattern, setUrlPattern] = useState("");
	const [saveError, setSaveError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const { configs } = await getPluginConfigs();
			const cheerioConfigs = configs.filter(c => c.pluginName === "cheerio-preprocessor");
			// Find best match for this URL (simple: first one whose pattern matches)
			const match = cheerioConfigs.find(c => {
				const escaped = c.urlPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
				return new RegExp(`^${escaped}$`).test(url);
			}) ?? null;
			setExisting(match);
			if (match) {
				const cfg = match.config ? JSON.parse(match.config) as Record<string, unknown> : {};
				setContentSelector((cfg.contentSelector as string) ?? "");
				setStripTags(((cfg.stripTags as string[]) ?? []).join(", "));
				const mc = (cfg.maxChars as number) ?? 32000;
				setUnlimitedChars(mc === 0);
				setMaxChars(mc === 0 ? "32000" : String(mc));
				setTextOnly(!!(cfg.textOnly));
				setEnabled(match.enabled);
				setUrlPattern(match.urlPattern);
			} else {
				const u = new URL(url);
				setUrlPattern(`${u.origin}${u.pathname}`);
				setContentSelector("");
				setStripTags("");
				setMaxChars("32000");
				setUnlimitedChars(false);
				setEnabled(true);
			}
		} finally {
			setLoading(false);
		}
	}, [url]);

	const handleOpen = useCallback(() => {
		setOpen(true);
		load();
	}, [load]);

	const save = async () => {
		setSaving(true);
		setSaveError(null);
		try {
			const cfg: Record<string, unknown> = {};
			if (contentSelector.trim()) cfg.contentSelector = contentSelector.trim();
			if (stripTags.trim()) cfg.stripTags = stripTags.split(",").map(s => s.trim()).filter(Boolean);
			const maxCharsNum = unlimitedChars ? 0 : Number(maxChars);
			if (!Number.isNaN(maxCharsNum) && maxCharsNum >= 0) cfg.maxChars = maxCharsNum;
			if (textOnly) cfg.textOnly = true;

			if (existing) {
				await updatePluginConfig(existing.id, { urlPattern, enabled, config: cfg });
			} else {
				await createPluginConfig({ pluginName: "cheerio-preprocessor", urlPattern, enabled, config: cfg });
			}
			await load();
			onSaved();
		} catch (e) {
			setSaveError(String(e));
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!existing) return;
		setSaving(true);
		try {
			await deletePluginConfig(existing.id);
			setExisting(null);
			setContentSelector("");
			setStripTags("");
			setMaxChars("32000");
			setUnlimitedChars(false);
			setTextOnly(false);
			setEnabled(true);
			onSaved();
		} finally {
			setSaving(false);
		}
	};

	const inputStyle = {
		background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
		borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#e2e8f0",
		width: "100%", boxSizing: "border-box" as const,
	};
	const labelStyle = { fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" as const };

	return (
		<div style={card}>
			<div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? 14 : 0 }}>
				<span>Cheerio extraction settings</span>
				<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
					{existing && !open && (
						<span style={{ fontSize: 10, color: "#51cf66", fontWeight: 600 }}>configured</span>
					)}
					<button onClick={open ? () => setOpen(false) : handleOpen} style={{
						background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
						padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
						color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", textTransform: "uppercase",
					}}>
						{open ? "Hide" : "Configure"}
					</button>
				</div>
			</div>
			{open && (
				loading ? (
					<p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>Loading…</p>
				) : (
					<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
						<div>
							<label style={labelStyle}>URL pattern (glob)</label>
							<input value={urlPattern} onInput={(e) => setUrlPattern((e.target as HTMLInputElement).value)} style={inputStyle} placeholder="https://example.com/path*" />
						</div>
						<div>
							<label style={labelStyle}>Content selector (CSS)</label>
							<input value={contentSelector} onInput={(e) => setContentSelector((e.target as HTMLInputElement).value)} style={inputStyle} placeholder="main, article, .content (leave blank for auto)" />
							<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4, display: "block" }}>Defaults to &lt;main&gt;, &lt;article&gt;, or [role=main]</span>
						</div>
						<div>
							<label style={labelStyle}>Extra tags to strip (comma-separated)</label>
							<input value={stripTags} onInput={(e) => setStripTags((e.target as HTMLInputElement).value)} style={inputStyle} placeholder="aside, .sidebar, #comments" />
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<input type="checkbox" id="cheerio-text-only" checked={textOnly} onChange={(e) => setTextOnly((e.target as HTMLInputElement).checked)} />
							<label for="cheerio-text-only" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>
								Text only (strip all HTML tags, output plain text)
							</label>
						</div>
						<div>
							<label style={labelStyle}>Max chars</label>
							<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
								<input type="number" value={maxChars} disabled={unlimitedChars} onInput={(e) => setMaxChars((e.target as HTMLInputElement).value)} style={{ ...inputStyle, width: 120, opacity: unlimitedChars ? 0.4 : 1 }} />
								<label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
									<input type="checkbox" checked={unlimitedChars} onChange={(e) => setUnlimitedChars((e.target as HTMLInputElement).checked)} />
									Unlimited
								</label>
							</div>
						</div>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							<input type="checkbox" id="cheerio-enabled" checked={enabled} onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)} />
							<label for="cheerio-enabled" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Enabled</label>
						</div>
						{saveError && <p style={{ fontSize: 12, color: "#ff8f8f", margin: 0 }}>{saveError}</p>}
						<div style={{ display: "flex", gap: 8 }}>
							<button onClick={save} disabled={saving} style={{
								background: "#228be6", color: "white", border: "none", borderRadius: 7,
								padding: "7px 16px", fontSize: 12, fontWeight: 600, cursor: saving ? "default" : "pointer",
								opacity: saving ? 0.6 : 1,
							}}>
								{saving ? "Saving…" : existing ? "Update" : "Save"}
							</button>
							{existing && (
								<button onClick={remove} disabled={saving} style={{
									background: "rgba(255,107,107,0.12)", color: "#ff8f8f",
									border: "1px solid rgba(255,107,107,0.25)", borderRadius: 7,
									padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: saving ? "default" : "pointer",
								}}>
									Remove
								</button>
							)}
						</div>
					</div>
				)
			)}
		</div>
	);
}

function PluginLogsViewer({ snapshotId }: { snapshotId: number | null }) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [logs, setLogs] = useState<{ id: number; pluginName: string; durationMs: number; inputData: string | null; outputData: string | null; error: string | null }[]>([]);
	const [expanded, setExpanded] = useState<Set<number>>(new Set());

	const load = useCallback(async () => {
		if (!snapshotId) return;
		setLoading(true);
		try {
			const { logs } = await getPluginLogs(snapshotId);
			setLogs(logs);
		} finally {
			setLoading(false);
		}
	}, [snapshotId]);

	const handleOpen = useCallback(() => {
		setOpen(true);
		load();
	}, [load]);

	if (!snapshotId) return null;

	const toggleExpanded = (id: number) => setExpanded(prev => {
		const next = new Set(prev);
		next.has(id) ? next.delete(id) : next.add(id);
		return next;
	});

	return (
		<div style={card}>
			<div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? 12 : 0 }}>
				<span>Pipeline logs</span>
				<button onClick={open ? () => setOpen(false) : handleOpen} style={{
					background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5,
					padding: "2px 8px", cursor: "pointer", fontSize: 10, fontWeight: 700,
					color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", textTransform: "uppercase",
				}}>
					{open ? "Hide" : "Show"}
				</button>
			</div>
			{open && (
				loading ? <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>Loading…</p> :
				logs.length === 0 ? <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>No logs for this snapshot. Enable debug mode in the prompt config to capture prompts and responses.</p> :
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{logs.map(log => {
						const isExpanded = expanded.has(log.id);
						const output = log.outputData ? JSON.parse(log.outputData) as Record<string, unknown> : null;
						const chunks = output?.chunks as { prompt: string; result: unknown; error?: string }[] | undefined;
						return (
							<div key={log.id} style={{ borderRadius: 7, border: `1px solid ${log.error ? "rgba(255,107,107,0.25)" : "rgba(255,255,255,0.07)"}`, overflow: "hidden" }}>
								<button onClick={() => toggleExpanded(log.id)} style={{
									width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "none",
									cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
								}}>
									<span style={{ fontSize: 12, fontWeight: 600, color: log.error ? "#ff8f8f" : "rgba(255,255,255,0.7)", flex: 1 }}>{log.pluginName}</span>
									<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{log.durationMs}ms</span>
									{log.error && <span style={{ fontSize: 10, color: "#ff8f8f", fontWeight: 700 }}>ERROR</span>}
									{chunks && <span style={{ fontSize: 10, color: "#ffd43b", fontWeight: 700 }}>{chunks.length} chunks</span>}
									<span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{isExpanded ? "▲" : "▼"}</span>
								</button>
								{isExpanded && (
									<div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
										{log.error && (
											<div>
												<div style={{ fontSize: 10, fontWeight: 700, color: "#ff8f8f", marginBottom: 4, textTransform: "uppercase" }}>Error</div>
												<pre style={{ margin: 0, fontSize: 11, color: "#ff8f8f", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{log.error}</pre>
											</div>
										)}
										{chunks ? (
											<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
												{chunks.map((chunk, i) => (
													<div key={i} style={{ borderRadius: 5, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
														<div style={{ padding: "5px 10px", background: "rgba(255,255,255,0.04)", fontSize: 11, fontWeight: 700, color: chunk.error ? "#ff8f8f" : "rgba(255,255,255,0.5)" }}>
															Chunk {i + 1}{chunk.error ? ` — ${chunk.error}` : ""}
														</div>
														<div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
															<LogSection label="Prompt" content={chunk.prompt} />
															<LogSection label="Result" content={JSON.stringify(chunk.result, null, 2)} />
														</div>
													</div>
												))}
											</div>
										) : output ? (
											<div>
												{output.error && <LogSection label="Plugin Error (Internal)" content={output.error as string} />}
												{output.promptSent && <LogSection label="Prompt sent" content={output.promptSent as string} />}
												{output.structuredContent && <LogSection label="Content passed to LLM" content={output.structuredContent as string} />}
												{output.rawResult && <LogSection label="LLM result" content={JSON.stringify(output.rawResult, null, 2)} />}
												{output.dataKeys && <LogSection label="Output keys" content={(output.dataKeys as string[]).join(", ")} />}
											</div>
										) : (
											<p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>No debug output — enable debug mode in the prompt config to see prompts and responses.</p>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function LogSection({ label, content }: { label: string; content: string }) {
	return (
		<div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
			<div style={{ padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
			<pre style={{ margin: 0, padding: "6px 10px 8px", fontSize: 11, color: "rgba(255,255,255,0.55)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto" }}>{content}</pre>
		</div>
	);
}
