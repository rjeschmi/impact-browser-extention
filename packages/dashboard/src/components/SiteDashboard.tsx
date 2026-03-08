import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { getVisits, getExtractions, askSnapshot, getSnapshots } from "../lib/api.js";
import { formatDuration, relativeTime, getFavicon } from "../lib/format.js";
import type { StoredExtraction, StoredPageVisit } from "@impact/shared";
import { SitePublishPanel } from "./SitePublishPanel.js";

const card = { background: "#1e2d50", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)", padding: "18px 20px" };
const sectionTitle = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" as const, marginBottom: 10 };

interface SnapshotInfo { id: number; url: string; domain: string; version: string; status: string; capturedAt: number; committedAt: number | null }

interface PriceMeta { price?: number; currency?: string; name?: string; availability?: string; source?: string }
interface DeadlineMeta { iso?: string }

function parseMeta<T>(s?: string | null): T {
	try { return s ? JSON.parse(s) as T : {} as T; } catch { return {} as T; }
}


interface ChatMessage { role: "user" | "assistant"; content: string }

function PageChat({ url, initialPrompt }: { url: string; initialPrompt?: string }) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState(initialPrompt ?? "");
	const [loading, setLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const firedRef = useRef(false);

	const send = useCallback(async (text: string, currentMessages: ChatMessage[]) => {
		if (!text.trim() || loading) return;
		const userMsg: ChatMessage = { role: "user", content: text };
		const next = [...currentMessages, userMsg];
		setMessages(next);
		setInput("");
		setLoading(true);
		try {
			const { answer } = await askSnapshot(url, text, currentMessages);
			setMessages([...next, { role: "assistant", content: answer }]);
		} catch (e) {
			setMessages([...next, { role: "assistant", content: `Error: ${String(e)}` }]);
		} finally {
			setLoading(false);
		}
	}, [loading, url]);

	useEffect(() => {
		if (initialPrompt && !firedRef.current) {
			firedRef.current = true;
			send(initialPrompt, []);
		}
	}, [initialPrompt, send]);

	useEffect(() => {
		if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
	}, [messages, loading]);

	return (
		<Section title="Ask AI">
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				{messages.length > 0 && (
					<div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto", padding: "4px 0" }}>
						{messages.map((m, i) => (
							<div key={i} style={{
								alignSelf: m.role === "user" ? "flex-end" : "flex-start",
								maxWidth: "85%",
								background: m.role === "user" ? "rgba(34,139,230,0.18)" : "rgba(255,255,255,0.06)",
								borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
								padding: "8px 12px",
								fontSize: 13,
								color: "#e2e8f0",
								lineHeight: 1.55,
								border: m.role === "user" ? "1px solid rgba(34,139,230,0.3)" : "1px solid rgba(255,255,255,0.08)",
								whiteSpace: "pre-wrap",
							}}>
								{m.content}
							</div>
						))}
						{loading && (
							<div style={{ alignSelf: "flex-start", fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "6px 12px", fontStyle: "italic" }}>
								Thinking…
							</div>
						)}
					</div>
				)}
				<div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
					<textarea
						value={input}
						onInput={e => setInput((e.target as HTMLTextAreaElement).value)}
						onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input, messages); } }}
						placeholder="Ask about this page… (Enter to send)"
						disabled={loading}
						rows={2}
						style={{
							flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
							borderRadius: 8, color: "#e2e8f0", fontSize: 13, padding: "8px 10px", resize: "none",
							outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1,
						}}
					/>
					<button
						onClick={() => send(input, messages)}
						disabled={!input.trim() || loading}
						style={{
							background: "#228be6", color: "white", border: "none", borderRadius: 8,
							padding: "8px 16px", fontSize: 13, cursor: !input.trim() || loading ? "default" : "pointer",
							opacity: !input.trim() || loading ? 0.5 : 1, flexShrink: 0, fontWeight: 500,
						}}>
						Ask
					</button>
				</div>
				<p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", margin: 0 }}>Uses stored snapshot data as context</p>
			</div>
		</Section>
	);
}

export function SiteDashboard({ domain, url, initialPrompt }: { domain: string; url?: string; initialPrompt?: string }) {
	const [visits, setVisits] = useState<StoredPageVisit[]>([]);
	const [extractions, setExtractions] = useState<StoredExtraction[]>([]);
	const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		Promise.all([
			getVisits({ domain, limit: "200" }),
			getExtractions({ domain, limit: "500" } as Record<string, string>),
			getSnapshots({ domain, limit: "100" }),
		]).then(([v, e, s]) => {
			setVisits(v.visits);
			setExtractions(e.extractions);
			setSnapshots(s.snapshots);
		}).catch(() => {}).finally(() => setLoading(false));
	}, [domain]);

	const dedup = (items: StoredExtraction[]) => {
		const seen = new Set<string>();
		return items.filter(e => seen.has(e.value) ? false : (seen.add(e.value), true));
	};

	const prices    = dedup(extractions.filter(e => e.kind === "price"));
	const deadlines = dedup(extractions.filter(e => e.kind === "deadline"));
	const keywords  = dedup(extractions.filter(e => e.kind === "keyword"));

	const totalDuration = visits.reduce((sum, v) => sum + v.durationMs, 0);
	const lastVisit = visits[0];

	if (loading) return <p style={{ color: "rgba(255,255,255,0.35)", padding: 28 }}>Loading...</p>;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

			{/* Header */}
			<div style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
				<img src={getFavicon(domain)} width={32} height={32} style={{ borderRadius: 6, flexShrink: 0 }}
					onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ fontSize: 18, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{domain}</div>
					<div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
						{visits.length} visit{visits.length !== 1 ? "s" : ""} · {formatDuration(totalDuration)} total
						{lastVisit ? ` · last ${relativeTime(lastVisit.visitedAt)}` : ""}
					</div>
				</div>
			</div>

			{/* Prices */}
			{prices.length > 0 && (
				<Section title="Prices">
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{prices.map(e => {
							const m = parseMeta<PriceMeta>(e.metadata);
							return (
								<div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(81,207,102,0.06)", borderRadius: 8, border: "1px solid rgba(81,207,102,0.15)" }}>
									<span style={{ fontSize: 18, fontWeight: 700, color: "#51cf66", flexShrink: 0 }}>
										{m.currency ?? ""} {m.price != null ? m.price.toLocaleString() : e.value}
									</span>
									<div style={{ flex: 1, minWidth: 0 }}>
										{m.name && <div style={{ fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>}
										<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, display: "flex", gap: 8 }}>
											{m.availability && <span>{m.availability}</span>}
											{m.source && <span>via {m.source}</span>}
											<span>{relativeTime(e.extractedAt)}</span>
										</div>
									</div>
									{e.context && e.context !== e.value && (
										<a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#74c0fc", textDecoration: "none", flexShrink: 0 }}>
											{new URL(e.url).pathname.slice(0, 30) || "/"}
										</a>
									)}
								</div>
							);
						})}
					</div>
				</Section>
			)}

			{/* Deadlines */}
			{deadlines.length > 0 && (
				<Section title="Deadlines">
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{deadlines.map(e => {
							const m = parseMeta<DeadlineMeta>(e.metadata);
							const date = m.iso ? new Date(m.iso) : null;
							const isPast = date ? date < new Date() : false;
							return (
								<div key={e.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 14px", background: "rgba(255,107,107,0.06)", borderRadius: 8, border: `1px solid ${isPast ? "rgba(255,107,107,0.3)" : "rgba(255,146,43,0.2)"}` }}>
									<div style={{ flexShrink: 0, textAlign: "center", minWidth: 48 }}>
										{date ? (
											<>
												<div style={{ fontSize: 18, fontWeight: 700, color: isPast ? "#ff6b6b" : "#ff922b", lineHeight: 1 }}>{date.getDate()}</div>
												<div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{date.toLocaleString("default", { month: "short" })}</div>
											</>
										) : <span style={{ fontSize: 18, color: "rgba(255,255,255,0.2)" }}>?</span>}
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{ fontSize: 13, color: "#e2e8f0" }}>{e.value}</div>
										{e.context && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.context}</div>}
										{isPast && <div style={{ fontSize: 10, color: "#ff6b6b", marginTop: 3 }}>Passed</div>}
									</div>
								</div>
							);
						})}
					</div>
				</Section>
			)}

			{/* Keywords / Page summaries */}
			{keywords.length > 0 && (
				<Section title="Page Summaries">
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{keywords.map(e => (
							<div key={e.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 7, borderLeft: "3px solid rgba(116,192,252,0.3)" }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>{e.value}</div>
									<div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>{relativeTime(e.extractedAt)}</div>
								</div>
								<a href={`/?view=diff&domain=${encodeURIComponent(domain)}&url=${encodeURIComponent(e.url)}`} title="View snapshot" style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textDecoration: "none", flexShrink: 0, alignSelf: "center", padding: "2px 4px" }}>↗</a>
							</div>
						))}
					</div>
				</Section>
			)}

			{/* Recent visits */}
			{visits.length > 0 && (
				<Section title={`Recent Visits (${visits.length})`}>
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						{visits.slice(0, 10).map(v => (
							<div key={v.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<a href={v.url} target="_blank" rel="noopener noreferrer"
										style={{ fontSize: 13, color: "#74c0fc", textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
										{v.title || v.url}
									</a>
								</div>
								<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{formatDuration(v.durationMs)}</span>
								<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>{relativeTime(v.visitedAt)}</span>
							</div>
						))}
					</div>
				</Section>
			)}

			{/* Snapshots */}
			{snapshots.length > 0 && (
				<Section title={`Snapshots (${snapshots.length})`}>
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{snapshots.map(s => (
							<div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.05)" }}>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
										<span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>v{s.version}</span>
										<span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: s.status === "committed" ? "rgba(81,207,102,0.15)" : "rgba(255,212,59,0.15)", color: s.status === "committed" ? "#51cf66" : "#ffd43b", textTransform: "uppercase", fontWeight: 700 }}>{s.status}</span>
										<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{relativeTime(s.capturedAt)}</span>
									</div>
									<div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</div>
								</div>
								<a href={`?view=diff&domain=${encodeURIComponent(s.domain)}&url=${encodeURIComponent(s.url)}`} style={{
									fontSize: 12, color: "#74c0fc", textDecoration: "none", fontWeight: 600,
									padding: "5px 10px", background: "rgba(116,192,252,0.1)", borderRadius: 6,
								}}>
									View Details
								</a>
							</div>
						))}
					</div>
				</Section>
			)}

			{extractions.length === 0 && visits.length === 0 && (
				<div style={{ ...card, textAlign: "center", padding: 40 }}>
					<p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>No data recorded for {domain} yet.</p>
				</div>
			)}

			{url && <PageChat url={url} initialPrompt={initialPrompt} />}

		<SitePublishPanel domain={domain} url={url} />
		</div>
	);
}

function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
	return (
		<div style={card}>
			<div style={sectionTitle}>{title}</div>
			{children}
		</div>
	);
}

