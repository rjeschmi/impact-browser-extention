import { useState, useEffect } from "preact/hooks";
import { getSuggestions, patchSuggestion } from "../lib/api.js";
import type { StoredSuggestion } from "@impact/shared";

const TYPE_LABELS: Record<string, string> = {
	revisit: "Revisit", deadline: "Deadline", price_change: "Price Change", stale: "Stale", frequent: "Frequent",
};
const PRIORITY_COLORS: Record<number, string> = {
	5: "#ff6b6b", 4: "#ff922b", 3: "#228be6", 2: "#51cf66", 1: "rgba(255,255,255,0.3)",
};

const card = { background: "#1e2d50", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" };

export function SuggestionList() {
	const [suggestions, setSuggestions] = useState<StoredSuggestion[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => { load(); }, []);

	async function load() {
		try {
			const data = await getSuggestions("active");
			setSuggestions(data.suggestions ?? []);
		} catch {}
		finally { setLoading(false); }
	}

	async function dismiss(id: number) {
		await patchSuggestion(id, { status: "dismissed" });
		setSuggestions(prev => prev.filter(s => s.id !== id));
	}

	async function snooze(id: number, hours: number) {
		await patchSuggestion(id, { status: "snoozed", snoozedUntil: Date.now() + hours * 3600000 });
		setSuggestions(prev => prev.filter(s => s.id !== id));
	}

	if (loading) return <p style={{ color: "rgba(255,255,255,0.35)" }}>Loading...</p>;

	if (suggestions.length === 0) {
		return (
			<div style={{ ...card, padding: "32px", textAlign: "center" }}>
				<p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
					No suggestions yet. Keep browsing — the engine will start noticing patterns.
				</p>
			</div>
		);
	}

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			{suggestions.map(s => <SuggestionCard key={s.id} suggestion={s} onDismiss={dismiss} onSnooze={snooze} />)}
		</div>
	);
}

function SuggestionCard({ suggestion: s, onDismiss, onSnooze }: {
	suggestion: StoredSuggestion;
	onDismiss: (id: number) => void;
	onSnooze: (id: number, hours: number) => void;
}) {
	const [showSnooze, setShowSnooze] = useState(false);
	const color = PRIORITY_COLORS[s.priority] ?? "rgba(255,255,255,0.3)";

	return (
		<div style={{ ...card, borderLeft: `3px solid ${color}`, padding: "12px 14px" }}>
			<div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
				<div style={{ flex: 1 }}>
					<div style={{ marginBottom: 5 }}>
						<span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", background: "rgba(255,255,255,0.08)", borderRadius: 4, color: "rgba(255,255,255,0.5)" }}>
							{TYPE_LABELS[s.type] ?? s.type}
						</span>
					</div>
					<p style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", margin: 0 }}>{s.title}</p>
					<p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "4px 0 0" }}>{s.body}</p>
					{s.url && (
						<a href={s.url} target="_blank" rel="noopener noreferrer"
							style={{ fontSize: 11, color: "#74c0fc", display: "block", marginTop: 5 }}>
							{new URL(s.url).hostname}
						</a>
					)}
				</div>
			</div>
			<div style={{ display: "flex", gap: 5, marginTop: 10 }}>
				{[
					{ label: "Dismiss", onClick: () => onDismiss(s.id), style: { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" } },
				].map(btn => (
					<button key={btn.label} onClick={btn.onClick} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, ...btn.style }}>
						{btn.label}
					</button>
				))}
				<div style={{ position: "relative" }}>
					<button onClick={() => setShowSnooze(!showSnooze)} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
						Snooze ▾
					</button>
					{showSnooze && (
						<div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, background: "#16213e", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", marginTop: 4 }}>
							{[{ label: "1 hour", h: 1 }, { label: "1 day", h: 24 }, { label: "1 week", h: 168 }].map(opt => (
								<button key={opt.h} onClick={() => { onSnooze(s.id, opt.h); setShowSnooze(false); }}
									style={{ display: "block", width: "100%", padding: "9px 18px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
									{opt.label}
								</button>
							))}
						</div>
					)}
				</div>
				{s.url && (
					<a href={s.url} target="_blank" rel="noopener noreferrer"
						style={{ padding: "5px 12px", background: "#228be6", color: "white", borderRadius: 6, fontSize: 12, textDecoration: "none", display: "inline-block" }}>
						Open
					</a>
				)}
			</div>
		</div>
	);
}
