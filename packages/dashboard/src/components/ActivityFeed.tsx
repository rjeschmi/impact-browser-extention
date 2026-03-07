import { useState, useEffect } from "preact/hooks";
import { getVisits } from "../lib/api.js";
import { formatDuration, relativeTime, getFavicon } from "../lib/format.js";
import type { StoredPageVisit } from "@impact/shared";

export function ActivityFeed() {
	const [visits, setVisits] = useState<StoredPageVisit[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState("");

	useEffect(() => {
		load();
		const interval = setInterval(load, 10000);
		return () => clearInterval(interval);
	}, []);

	async function load() {
		try {
			const data = await getVisits({ limit: "200" });
			setVisits(data.visits);
		} catch {
			// backend may be starting
		} finally {
			setLoading(false);
		}
	}

	const filtered = filter
		? visits.filter(v => v.domain.includes(filter) || v.title.toLowerCase().includes(filter.toLowerCase()))
		: visits;

	return (
		<div>
			<div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
				<input
					type="text"
					placeholder="Filter by domain or title..."
					value={filter}
					onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
					style={{
						flex: 1, padding: "8px 12px", border: "1px solid #dee2e6",
						borderRadius: 8, fontSize: 14, outline: "none",
					}}
				/>
				<button onClick={load} style={{
					padding: "8px 16px", background: "#e9ecef", border: "none",
					borderRadius: 8, cursor: "pointer", fontSize: 14,
				}}>
					Refresh
				</button>
			</div>

			{loading && <p style={{ color: "#868e96" }}>Loading...</p>}
			{!loading && filtered.length === 0 && (
				<p style={{ color: "#868e96" }}>
					{visits.length === 0
						? "No visits tracked yet. Browse around and come back!"
						: "No visits match that filter."}
				</p>
			)}

			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{filtered.map(v => <VisitRow key={v.id} visit={v} />)}
			</div>
		</div>
	);
}

function VisitRow({ visit }: { visit: StoredPageVisit }) {
	return (
		<div style={{
			display: "flex", alignItems: "center", gap: 12,
			padding: "10px 14px", background: "white", borderRadius: 10,
			border: "1px solid #e9ecef",
		}}>
			<img
				src={getFavicon(visit.domain)}
				width={16} height={16}
				style={{ flexShrink: 0, opacity: 0.8 }}
				onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<a
					href={visit.url}
					target="_blank"
					rel="noopener noreferrer"
					style={{ color: "#1c7ed6", textDecoration: "none", fontSize: 14, fontWeight: 500 }}
					title={visit.url}
				>
					<span style={{
						display: "block", overflow: "hidden",
						textOverflow: "ellipsis", whiteSpace: "nowrap",
					}}>
						{visit.title || visit.url}
					</span>
				</a>
				<span style={{ fontSize: 12, color: "#868e96" }}>{visit.domain}</span>
			</div>
			<div style={{ textAlign: "right", flexShrink: 0 }}>
				<div style={{ fontSize: 12, color: "#495057" }}>{formatDuration(visit.durationMs)}</div>
				<div style={{ fontSize: 11, color: "#adb5bd" }}>{relativeTime(visit.visitedAt)}</div>
			</div>
		</div>
	);
}
