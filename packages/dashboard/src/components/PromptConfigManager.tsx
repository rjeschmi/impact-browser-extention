import { useState, useEffect } from "preact/hooks";
import { getPromptConfigs, createPromptConfig, updatePromptConfig, deletePromptConfig } from "../lib/api.js";
import type { PromptConfig } from "../lib/api.js";

const inp = {
	background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
	borderRadius: "7px", color: "#e2e8f0", fontSize: 13, padding: "7px 10px", outline: "none",
	fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const,
};
const ta = { ...inp, resize: "vertical" as const, lineHeight: "1.5" };
const smallBtn = (variant: "primary" | "danger" | "ghost" = "ghost") => ({
	padding: "5px 12px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600,
	cursor: "pointer", flexShrink: 0,
	...(variant === "primary" ? { background: "#228be6", color: "white" }
		: variant === "danger" ? { background: "rgba(255,107,107,0.12)", color: "#ff8f8f", border: "1px solid rgba(255,107,107,0.25)" }
		: { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }),
});
const fieldLabel = { fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.05em" };

function SlidingWindowFields({ enabled, chunkSize, onEnabledChange, onChunkSizeChange }: {
	enabled: boolean;
	chunkSize: string;
	onEnabledChange: (v: boolean) => void;
	onChunkSizeChange: (v: string) => void;
}) {
	return (
		<div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "10px 12px", background: "rgba(255,255,255,0.02)" }}>
			<label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
				<input type="checkbox" checked={enabled} onChange={e => onEnabledChange((e.target as HTMLInputElement).checked)} />
				<span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>Sliding window</span>
			</label>
			<p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: "6px 0 0 22px", lineHeight: 1.5 }}>
				Split large pages into overlapping chunks and run the LLM on each. Results are merged — arrays concatenated, strings keep the longest value.
			</p>
			{enabled && (
				<div style={{ marginTop: 10, marginLeft: 22 }}>
					<div style={fieldLabel}>Chunk size (chars)</div>
					<input
						type="number"
						value={chunkSize}
						onInput={e => onChunkSizeChange((e.target as HTMLInputElement).value)}
						style={{ ...inp, width: 120 }}
						min={1000}
						step={500}
					/>
					<span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 8 }}>default 6000</span>
				</div>
			)}
		</div>
	);
}

function ConfigRow({ cfg, onSave, onDelete }: {
	cfg: PromptConfig;
	onSave: (id: number, fields: { urlPattern: string; prompt: string; slidingWindow: boolean; chunkSize: number | null; debug: boolean }) => Promise<void>;
	onDelete: (id: number) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [pattern, setPattern] = useState(cfg.urlPattern);
	const [prompt, setPrompt] = useState(cfg.prompt);
	const [slidingWindow, setSlidingWindow] = useState(cfg.slidingWindow);
	const [chunkSize, setChunkSize] = useState(String(cfg.chunkSize ?? 6000));
	const [debug, setDebug] = useState(cfg.debug ?? false);
	const [saving, setSaving] = useState(false);

	async function save() {
		setSaving(true);
		try {
			await onSave(cfg.id, {
				urlPattern: pattern,
				prompt,
				slidingWindow,
				chunkSize: slidingWindow ? (Number(chunkSize) || 6000) : null,
			});
			setEditing(false);
		} finally { setSaving(false); }
	}

	function cancel() {
		setEditing(false);
		setPattern(cfg.urlPattern);
		setPrompt(cfg.prompt);
		setSlidingWindow(cfg.slidingWindow);
		setChunkSize(String(cfg.chunkSize ?? 6000));
		setDebug(cfg.debug ?? false);
	}

	return (
		<div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", background: "rgba(255,255,255,0.02)" }}>
			{editing ? (
				<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
					<div>
						<div style={fieldLabel}>URL Pattern</div>
						<input value={pattern} onInput={e => setPattern((e.target as HTMLInputElement).value)} style={inp} placeholder="https://example.com/*" />
					</div>
					<div>
						<div style={fieldLabel}>Prompt</div>
						<textarea value={prompt} onInput={e => setPrompt((e.target as HTMLTextAreaElement).value)} rows={8} style={ta} />
					</div>
					<SlidingWindowFields enabled={slidingWindow} chunkSize={chunkSize} onEnabledChange={setSlidingWindow} onChunkSizeChange={setChunkSize} />
				<label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
					<input type="checkbox" checked={debug} onChange={e => setDebug((e.target as HTMLInputElement).checked)} />
					Debug mode (logs prompts + responses to pipeline logs)
				</label>
					<div style={{ display: "flex", gap: 8 }}>
						<button onClick={save} disabled={saving} style={smallBtn("primary")}>{saving ? "Saving…" : "Save"}</button>
						<button onClick={cancel} style={smallBtn()}>Cancel</button>
					</div>
				</div>
			) : (
				<div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
							<div style={{ fontSize: 13, fontWeight: 600, color: "#74c0fc", fontFamily: "monospace", wordBreak: "break-all" }}>{cfg.urlPattern}</div>
							{cfg.slidingWindow && (
								<span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(255,212,59,0.12)", color: "#ffd43b", flexShrink: 0 }}>
									sliding window{cfg.chunkSize ? ` ${cfg.chunkSize}` : ""}
								</span>
							)}
						{cfg.debug && (
							<span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(81,207,102,0.12)", color: "#51cf66", flexShrink: 0 }}>debug</span>
						)}
						</div>
						<div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
							{cfg.prompt.slice(0, 120)}{cfg.prompt.length > 120 ? "…" : ""}
						</div>
					</div>
					<div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
						<button onClick={() => setEditing(true)} style={smallBtn()}>Edit</button>
						<button onClick={() => onDelete(cfg.id)} style={smallBtn("danger")}>Delete</button>
					</div>
				</div>
			)}
		</div>
	);
}

export function PromptConfigManager() {
	const [configs, setConfigs] = useState<PromptConfig[]>([]);
	const [defaultPrompt, setDefaultPrompt] = useState("");
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [newPattern, setNewPattern] = useState("");
	const [newPrompt, setNewPrompt] = useState("");
	const [newSlidingWindow, setNewSlidingWindow] = useState(false);
	const [newChunkSize, setNewChunkSize] = useState("6000");
	const [newDebug, setNewDebug] = useState(false);
	const [showDefault, setShowDefault] = useState(false);

	useEffect(() => {
		getPromptConfigs()
			.then(d => { setConfigs(d.configs); setDefaultPrompt(d.defaultPrompt); setNewPrompt(d.defaultPrompt); })
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	async function handleCreate(e: Event) {
		e.preventDefault();
		if (!newPattern.trim() || !newPrompt.trim()) return;
		const cfg = await createPromptConfig(newPattern.trim(), newPrompt.trim(), {
			slidingWindow: newSlidingWindow || undefined,
			chunkSize: newSlidingWindow ? (Number(newChunkSize) || 6000) : undefined,
			debug: newDebug || undefined,
		});
		setConfigs(prev => [cfg, ...prev]);
		setAdding(false);
		setNewPattern("");
		setNewPrompt(defaultPrompt);
		setNewSlidingWindow(false);
		setNewChunkSize("6000");
		setNewDebug(false);
	}

	async function handleSave(id: number, fields: { urlPattern: string; prompt: string; slidingWindow: boolean; chunkSize: number | null; debug: boolean }) {
		const updated = await updatePromptConfig(id, fields);
		setConfigs(prev => prev.map(c => c.id === id ? updated : c));
	}

	async function handleDelete(id: number) {
		if (!confirm("Delete this prompt config?")) return;
		await deletePromptConfig(id);
		setConfigs(prev => prev.filter(c => c.id !== id));
	}

	if (loading) return <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading…</p>;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6, margin: 0 }}>
				Extraction prompts control what the AI extracts when you save a snapshot. Patterns use <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3, color: "#74c0fc" }}>*</code> as wildcard. More specific patterns take precedence. Available placeholders: <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3, color: "#ffd43b" }}>{"{url}"}</code> and <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3, color: "#ffd43b" }}>{"{pageText}"}</code>.
			</p>

			{/* Default prompt */}
			<div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
				<button
					onClick={() => setShowDefault(v => !v)}
					style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
					<span style={{ fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Default Prompt (fallback)</span>
					<span>{showDefault ? "▲" : "▼"}</span>
				</button>
				{showDefault && (
					<pre style={{ margin: 0, padding: "12px 14px", fontSize: 11, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", background: "rgba(255,255,255,0.02)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
						{defaultPrompt}
					</pre>
				)}
			</div>

			{/* Existing configs */}
			{configs.length > 0 && (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{configs.map(cfg => (
						<ConfigRow key={cfg.id} cfg={cfg} onSave={handleSave} onDelete={handleDelete} />
					))}
				</div>
			)}

			{/* Add new */}
			{adding ? (
				<form onSubmit={handleCreate} style={{ border: "1px solid rgba(34,139,230,0.25)", borderRadius: 8, padding: "12px 14px", background: "rgba(34,139,230,0.04)", display: "flex", flexDirection: "column", gap: 10 }}>
					<div>
						<div style={fieldLabel}>URL Pattern</div>
						<input value={newPattern} onInput={e => setNewPattern((e.target as HTMLInputElement).value)}
							style={inp} placeholder="https://shop.example.com/*" autoFocus />
					</div>
					<div>
						<div style={fieldLabel}>Prompt Template</div>
						<textarea value={newPrompt} onInput={e => setNewPrompt((e.target as HTMLTextAreaElement).value)} rows={10} style={ta} />
					</div>
					<SlidingWindowFields enabled={newSlidingWindow} chunkSize={newChunkSize} onEnabledChange={setNewSlidingWindow} onChunkSizeChange={setNewChunkSize} />
				<label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
					<input type="checkbox" checked={newDebug} onChange={e => setNewDebug((e.target as HTMLInputElement).checked)} />
					Debug mode (logs prompts + responses to pipeline logs)
				</label>
					<div style={{ display: "flex", gap: 8 }}>
						<button type="submit" style={smallBtn("primary")}>Create</button>
						<button type="button" onClick={() => { setAdding(false); setNewPattern(""); setNewPrompt(defaultPrompt); setNewSlidingWindow(false); setNewChunkSize("6000"); setNewDebug(false); }} style={smallBtn()}>Cancel</button>
					</div>
				</form>
			) : (
				<button onClick={() => setAdding(true)} style={{
					padding: "9px", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.15)",
					background: "transparent", color: "rgba(255,255,255,0.4)", fontSize: 13,
					cursor: "pointer", width: "100%", textAlign: "center",
				}}>
					+ Add URL pattern
				</button>
			)}
		</div>
	);
}
