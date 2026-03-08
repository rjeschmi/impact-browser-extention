import { useState, useEffect } from "preact/hooks";
import { getVisits, getExtractions } from "../lib/api.js";
import { formatDuration, relativeTime, getFavicon } from "../lib/format.js";
import type { StoredPageVisit, StoredExtraction } from "@impact/shared";

const KIND = {
	price:    { label: "Price",    color: "#51cf66" },
	deadline: { label: "Deadline", color: "#ff6b6b" },
	todo:     { label: "TODO",     color: "#ff922b" },
	keyword:  { label: "Keyword",  color: "#74c0fc" },
	form:     { label: "Form",     color: "#da77f2" },
} as Record<string, { label: string; color: string }>;

const card = { background: "#1e2d50", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" };
const input = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0", fontSize: 14, padding: "8px 12px", outline: "none" };

interface DomainGroup {
	domain: string;
	visits: StoredPageVisit[];        // sorted newest first
	totalDurationMs: number;
	mostRecentVisit: StoredPageVisit; // visits[0]
}

function groupByDomain(visits: StoredPageVisit[]): DomainGroup[] {
	const map = new Map<string, StoredPageVisit[]>();
	for (const v of visits) {
		const existing = map.get(v.domain);
		if (existing) existing.push(v);
		else map.set(v.domain, [v]);
	}
	return Array.from(map.entries()).map(([domain, vs]) => ({
		domain,
		visits: vs, // already sorted newest-first from API
		totalDurationMs: vs.reduce((sum, v) => sum + v.durationMs, 0),
		mostRecentVisit: vs[0],
	}));
}

export function ActivityFeed() {
	const [visits, setVisits] = useState<StoredPageVisit[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("");

	useEffect(() => {
		load();
		const t = setInterval(load, 10000);
		return () => clearInterval(t);
	}, []);

	async function load() {
		try {
			const data = await getVisits({ limit: "200" });
			setVisits(data.visits);
		} catch {}
		finally { setLoading(false); }
	}

	const filteredVisits = filter
		? visits.filter(v => v.domain.includes(filter) || v.title.toLowerCase().includes(filter.toLowerCase()))
		: visits;

	const groups = groupByDomain(filteredVisits);

	return (
		<div>
			<div style={{ marginBottom: 14, display: "flex", gap: 8 }}>
				<input
					type="text"
					placeholder="Filter by domain or title..."
					value={filter}
					onInput={e => setFilter((e.target as HTMLInputElement).value)}
					style={{ ...input, flex: 1 }}
				/>
				<button onClick={load} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer", fontSize: 14, color: "#e2e8f0" }}>
					Refresh
				</button>
			</div>
			{loading && <p style={{ color: "rgba(255,255,255,0.35)" }}>Loading...</p>}
			{!loading && groups.length === 0 && (
				<p style={{ color: "rgba(255,255,255,0.35)" }}>
					{visits.length === 0 ? "No visits tracked yet. Browse around and come back!" : "No visits match that filter."}
				</p>
			)}
			<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
				{groups.map(g => <DomainRow key={g.domain} group={g} />)}
			</div>
		</div>
	);
}

function DomainRow({ group }: { group: DomainGroup }) {
	const [expanded, setExpanded] = useState(false);
	const { domain, visits, totalDurationMs, mostRecentVisit } = group;

	return (
		<div style={{ ...card, overflow: "hidden" }}>
			{/* Domain summary row */}
			<div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
				<img src={getFavicon(domain)} width={15} height={15} style={{ flexShrink: 0, opacity: 0.7 }}
					onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{domain}
					</div>
					<div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
						{visits.length} visit{visits.length !== 1 ? "s" : ""} · last {relativeTime(mostRecentVisit.visitedAt)}
					</div>
				</div>
				<div style={{ textAlign: "right", flexShrink: 0 }}>
					<div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{formatDuration(totalDurationMs)}</div>
				</div>
				<a
					href={`/?domain=${encodeURIComponent(domain)}`}
					onClick={e => e.stopPropagation()}
					title="View site dashboard"
					style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textDecoration: "none", flexShrink: 0, padding: "2px 4px" }}
				>
					↗
				</a>
				<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{expanded ? "▲" : "▼"}</span>
			</div>

			{/* Expanded: individual visits */}
			{expanded && (
				<div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}>
					{visits.map(v => <VisitRow key={v.id} visit={v} />)}
				</div>
			)}
		</div>
	);
}

function VisitRow({ visit }: { visit: StoredPageVisit }) {
	const [expanded, setExpanded] = useState(false);
	const [extractions, setExtractions] = useState<StoredExtraction[] | null>(null);
	const [loadingEx, setLoadingEx] = useState(false);

	async function toggle() {
		const next = !expanded;
		setExpanded(next);
		if (next && extractions === null) {
			setLoadingEx(true);
			try {
				const data = await getExtractions({ url: visit.url, limit: "20" });
				setExtractions(data.extractions);
			} catch { setExtractions([]); }
			finally { setLoadingEx(false); }
		}
	}

	return (
		<div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px 8px 36px", cursor: "pointer" }} onClick={toggle}>
				<div style={{ flex: 1, minWidth: 0 }}>
					<a href={visit.url} target="_blank" rel="noopener noreferrer"
						onClick={e => e.stopPropagation()}
						style={{ color: "#74c0fc", textDecoration: "none", fontSize: 12 }}
						title={visit.url}>
						<span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
							{visit.title || visit.url}
						</span>
					</a>
				</div>
				<div style={{ textAlign: "right", flexShrink: 0 }}>
					<span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{formatDuration(visit.durationMs)}</span>
					<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>{relativeTime(visit.visitedAt)}</span>
				</div>
				<a
					href={`/?view=diff&domain=${encodeURIComponent(visit.domain)}&url=${encodeURIComponent(visit.url)}`}
					onClick={e => e.stopPropagation()}
					title="View snapshot"
					style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textDecoration: "none", flexShrink: 0, padding: "2px 4px" }}
				>
					↗
				</a>
				<span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{expanded ? "▲" : "▼"}</span>
			</div>
			{expanded && (
				<div style={{ padding: "6px 14px 10px 36px", background: "rgba(0,0,0,0.1)" }}>
					{loadingEx && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>Loading...</p>}
					{!loadingEx && extractions?.length === 0 && (
						<p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: 0 }}>No content extracted from this page.</p>
					)}
					{!loadingEx && extractions && extractions.length > 0 && (
						<div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
							{extractions.map(e => <ExtractionChip key={e.id} extraction={e} />)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function ExtractionChip({ extraction: e }: { extraction: StoredExtraction }) {
	const k = KIND[e.kind] ?? { label: e.kind, color: "#868e96" };
	return (
		<div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
			<span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: `${k.color}22`, color: k.color, flexShrink: 0, marginTop: 1 }}>
				{k.label}
			</span>
			<div style={{ minWidth: 0 }}>
				<span style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>{e.value}</span>
				{e.context && e.context !== e.value && (
					<p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
						{e.context}
					</p>
				)}
			</div>
		</div>
	);
}
