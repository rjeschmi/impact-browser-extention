import { useState, useEffect, useCallback } from "preact/hooks";
import { getSnapshotForUrl, commitSnapshotById, reextractSnapshot } from "../lib/api.js";

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
			})
			.catch(e => setError(String(e)))
			.finally(() => setLoading(false));
	}, [url]);

	const refresh = useCallback(async () => {
		const snap = await getSnapshotForUrl(url);
		setCommitted(snap.committed ? { ...snap.committed, data: JSON.parse(snap.committed.data) as Record<string, unknown> } : null);
		setPending(snap.pending ? { ...snap.pending, data: JSON.parse(snap.pending.data) as Record<string, unknown> } : null);
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
			</div>
		);
	}

	// Has pending — show diff
	const diffEntries = committed
		? diffObjects(committed.data, pending!.data)
		: Object.entries(pending!.data).filter(([k]) => k !== "version").map(([k, v]) => ({ key: k, status: "added" as FieldStatus, newVal: v }));

	const changedCount = diffEntries.filter(e => e.status !== "unchanged").length;

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
							onClick={commit}
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
				<div style={sectionTitle}>Changes</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{diffEntries.map(e => <DiffRow key={e.key} entry={e} />)}
				</div>
			</div>
		</div>
	);
}

function Header({ url, domain, title }: { url: string; domain: string; title: string }) {
	return (
		<div style={{ ...card, padding: "14px 20px" }}>
			<div style={{ fontSize: 17, fontWeight: 700, color: "white", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
			<a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#74c0fc", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{url}</a>
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
