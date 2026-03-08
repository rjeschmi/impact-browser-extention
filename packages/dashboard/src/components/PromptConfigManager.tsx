import { useState, useEffect } from "preact/hooks";
import { getPromptConfigs, createPromptConfig, updatePromptConfig, deletePromptConfig } from "../lib/api.js";

type PromptConfig = { id: number; urlPattern: string; prompt: string; updatedAt: number };

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

function ConfigRow({ cfg, onSave, onDelete }: {
	cfg: PromptConfig;
	onSave: (id: number, urlPattern: string, prompt: string) => Promise<void>;
	onDelete: (id: number) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [pattern, setPattern] = useState(cfg.urlPattern);
	const [prompt, setPrompt] = useState(cfg.prompt);
	const [saving, setSaving] = useState(false);

	async function save() {
		setSaving(true);
		try { await onSave(cfg.id, pattern, prompt); setEditing(false); }
		finally { setSaving(false); }
	}

	return (
		<div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "12px 14px", background: "rgba(255,255,255,0.02)" }}>
			{editing ? (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					<div>
						<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>URL Pattern</div>
						<input value={pattern} onInput={e => setPattern((e.target as HTMLInputElement).value)} style={inp} placeholder="https://example.com/*" />
					</div>
					<div>
						<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prompt</div>
						<textarea value={prompt} onInput={e => setPrompt((e.target as HTMLTextAreaElement).value)} rows={8} style={ta} />
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<button onClick={save} disabled={saving} style={smallBtn("primary")}>{saving ? "Saving…" : "Save"}</button>
						<button onClick={() => { setEditing(false); setPattern(cfg.urlPattern); setPrompt(cfg.prompt); }} style={smallBtn()}>Cancel</button>
					</div>
				</div>
			) : (
				<div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div style={{ fontSize: 13, fontWeight: 600, color: "#74c0fc", marginBottom: 4, fontFamily: "monospace", wordBreak: "break-all" }}>{cfg.urlPattern}</div>
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
		const cfg = await createPromptConfig(newPattern.trim(), newPrompt.trim());
		setConfigs(prev => [cfg, ...prev]);
		setAdding(false);
		setNewPattern("");
		setNewPrompt(defaultPrompt);
	}

	async function handleSave(id: number, urlPattern: string, prompt: string) {
		const updated = await updatePromptConfig(id, { urlPattern, prompt });
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
				<form onSubmit={handleCreate} style={{ border: "1px solid rgba(34,139,230,0.25)", borderRadius: 8, padding: "12px 14px", background: "rgba(34,139,230,0.04)", display: "flex", flexDirection: "column", gap: 8 }}>
					<div>
						<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>URL Pattern</div>
						<input value={newPattern} onInput={e => setNewPattern((e.target as HTMLInputElement).value)}
							style={inp} placeholder="https://shop.example.com/*" autoFocus />
					</div>
					<div>
						<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Prompt Template</div>
						<textarea value={newPrompt} onInput={e => setNewPrompt((e.target as HTMLTextAreaElement).value)} rows={10} style={ta} />
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<button type="submit" style={smallBtn("primary")}>Create</button>
						<button type="button" onClick={() => { setAdding(false); setNewPattern(""); setNewPrompt(defaultPrompt); }} style={smallBtn()}>Cancel</button>
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
