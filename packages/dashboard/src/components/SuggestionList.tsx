import { useState, useEffect } from "preact/hooks";
import { getSuggestions, patchSuggestion } from "../lib/api.js";
import type { StoredSuggestion } from "@impact/shared";

const TYPE_LABELS: Record<string, string> = {
	revisit: "Revisit",
	deadline: "Deadline",
	price_change: "Price Change",
	stale: "Stale",
	frequent: "Frequent",
};

const PRIORITY_COLORS: Record<number, string> = {
	5: "#ff6b6b",
	4: "#ff922b",
	3: "#228be6",
	2: "#51cf66",
	1: "#868e96",
};

export function SuggestionList() {
	const [suggestions, setSuggestions] = useState<StoredSuggestion[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		load();
	}, []);

	async function load() {
		try {
			const data = await getSuggestions("active");
			setSuggestions(data.suggestions ?? []);
		} catch {
			// suggestions endpoint may not exist yet
		} finally {
			setLoading(false);
		}
	}

	async function dismiss(id: number) {
		await patchSuggestion(id, { status: "dismissed" });
		setSuggestions(prev => prev.filter(s => s.id !== id));
	}

	async function snooze(id: number, hours: number) {
		await patchSuggestion(id, { status: "snoozed", snoozedUntil: Date.now() + hours * 3600000 });
		setSuggestions(prev => prev.filter(s => s.id !== id));
	}

	if (loading) return <p style={{ color: "#868e96" }}>Loading...</p>;

	if (suggestions.length === 0) {
		return (
			<div style={{
				padding: "32px", textAlign: "center",
				background: "white", borderRadius: 10, border: "1px solid #e9ecef",
			}}>
				<p style={{ color: "#868e96", fontSize: 14 }}>
					No suggestions yet. Keep browsing — the engine will start noticing patterns.
				</p>
			</div>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			{suggestions.map(s => (
				<SuggestionCard key={s.id} suggestion={s} onDismiss={dismiss} onSnooze={snooze} />
			))}
		</div>
	);
}

function SuggestionCard({
	suggestion: s,
	onDismiss,
	onSnooze,
}: {
	suggestion: StoredSuggestion;
	onDismiss: (id: number) => void;
	onSnooze: (id: number, hours: number) => void;
}) {
	const [showSnooze, setShowSnooze] = useState(false);
	const color = PRIORITY_COLORS[s.priority] ?? "#868e96";

	return (
		<div style={{
			background: "white", borderRadius: 10, border: "1px solid #e9ecef",
			borderLeft: `3px solid ${color}`, padding: "12px 14px",
		}}>
			<div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
				<div style={{ flex: 1 }}>
					<div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
						<span style={{
							fontSize: 11, fontWeight: 600, padding: "2px 6px",
							background: "#f1f3f5", borderRadius: 4, color: "#495057",
						}}>
							{TYPE_LABELS[s.type] ?? s.type}
						</span>
					</div>
					<p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
					<p style={{ fontSize: 13, color: "#868e96", margin: "4px 0 0" }}>{s.body}</p>
					{s.url && (
						<a href={s.url} target="_blank" rel="noopener noreferrer"
							style={{ fontSize: 12, color: "#1c7ed6", display: "block", marginTop: 4 }}
						>
							{new URL(s.url).hostname}
						</a>
					)}
				</div>
			</div>
			<div style={{ display: "flex", gap: 6, marginTop: 10 }}>
				<button onClick={() => onDismiss(s.id)} style={btnStyle("#f1f3f5", "#495057")}>
					Dismiss
				</button>
				<div style={{ position: "relative" }}>
					<button onClick={() => setShowSnooze(!showSnooze)} style={btnStyle("#f1f3f5", "#495057")}>
						Snooze ▾
					</button>
					{showSnooze && (
						<div style={{
							position: "absolute", top: "100%", left: 0, zIndex: 10,
							background: "white", border: "1px solid #dee2e6",
							borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
						}}>
							{[{ label: "1 hour", h: 1 }, { label: "1 day", h: 24 }, { label: "1 week", h: 168 }].map(opt => (
								<button key={opt.h} onClick={() => { onSnooze(s.id, opt.h); setShowSnooze(false); }}
									style={{ display: "block", width: "100%", padding: "8px 16px", border: "none",
										background: "none", cursor: "pointer", textAlign: "left", fontSize: 13,
										color: "#495057" }}
								>
									{opt.label}
								</button>
							))}
						</div>
					)}
				</div>
				{s.url && (
					<a href={s.url} target="_blank" rel="noopener noreferrer"
						style={{ ...btnStyle("#228be6", "white"), textDecoration: "none", display: "inline-block" }}
					>
						Open
					</a>
				)}
			</div>
		</div>
	);
}

function btnStyle(bg: string, color: string): Record<string, string> {
	return {
		padding: "5px 12px", border: "none", borderRadius: 6,
		cursor: "pointer", fontSize: 13, background: bg, color,
	};
}
