import { useState, useEffect } from "preact/hooks";
import {
	getPromptConfigs,
	createPromptConfig,
	updatePromptConfig,
	deletePromptConfig,
	suggestPrompt,
} from "../lib/api.js";
import type { PromptConfig } from "../lib/api.js";

const inp = {
	background: "rgba(255,255,255,0.06)",
	border: "1px solid rgba(255,255,255,0.12)",
	borderRadius: "7px",
	color: "#e2e8f0",
	fontSize: 13,
	padding: "7px 10px",
	outline: "none",
	fontFamily: "inherit",
	width: "100%",
	boxSizing: "border-box" as const,
};
const ta = { ...inp, resize: "vertical" as const, lineHeight: "1.5" };
const smallBtn = (variant: "primary" | "danger" | "ghost" = "ghost") => ({
	padding: "5px 12px",
	borderRadius: 6,
	border: "none",
	fontSize: 12,
	fontWeight: 600,
	cursor: "pointer",
	flexShrink: 0,
	...(variant === "primary"
		? { background: "#228be6", color: "white" }
		: variant === "danger"
			? {
					background: "rgba(255,107,107,0.12)",
					color: "#ff8f8f",
					border: "1px solid rgba(255,107,107,0.25)",
				}
			: {
					background: "rgba(255,255,255,0.07)",
					color: "rgba(255,255,255,0.5)",
					border: "1px solid rgba(255,255,255,0.1)",
				}),
});
const fieldLabel = {
	fontSize: 11,
	color: "rgba(255,255,255,0.3)",
	fontWeight: 700,
	marginBottom: 4,
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
};

function CheerioFields({
	selector,
	stripTags,
	textOnly,
	onSelectorChange,
	onStripTagsChange,
	onTextOnlyChange,
}: {
	selector: string;
	stripTags: string;
	textOnly: boolean;
	onSelectorChange: (v: string) => void;
	onStripTagsChange: (v: string) => void;
	onTextOnlyChange: (v: boolean) => void;
}) {
	return (
		<div
			style={{
				border: "1px solid rgba(255,255,255,0.07)",
				borderRadius: 7,
				padding: "10px 12px",
				background: "rgba(255,255,255,0.02)",
			}}
		>
			<div style={{ ...fieldLabel, marginBottom: 8 }}>
				Cheerio Preprocessing
			</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				<div>
					<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", mb: 4 }}>
						Content Selector
					</div>
					<input
						value={selector}
						onInput={(e) => onSelectorChange((e.target as HTMLInputElement).value)}
						style={inp}
						placeholder=".main-content, article, etc."
					/>
				</div>
				<div>
					<div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", mb: 4 }}>
						Strip Tags (comma separated)
					</div>
					<input
						value={stripTags}
						onInput={(e) => onStripTagsChange((e.target as HTMLInputElement).value)}
						style={inp}
						placeholder="nav, footer, .ads"
					/>
				</div>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						cursor: "pointer",
					}}
				>
					<input
						type="checkbox"
						checked={textOnly}
						onChange={(e) =>
							onTextOnlyChange((e.target as HTMLInputElement).checked)
						}
					/>
					<span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
						Text only (strip all HTML structure)
					</span>
				</label>
			</div>
		</div>
	);
}

function SlidingWindowFields({
	enabled,
	chunkSize,
	onEnabledChange,
	onChunkSizeChange,
}: {
	enabled: boolean;
	chunkSize: string;
	onEnabledChange: (v: boolean) => void;
	onChunkSizeChange: (v: string) => void;
}) {
	return (
		<div
			style={{
				border: "1px solid rgba(255,255,255,0.07)",
				borderRadius: 7,
				padding: "10px 12px",
				background: "rgba(255,255,255,0.02)",
			}}
		>
			<label
				style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
			>
				<input
					type="checkbox"
					checked={enabled}
					onChange={(e) =>
						onEnabledChange((e.target as HTMLInputElement).checked)
					}
				/>
				<span
					style={{
						fontSize: 13,
						color: "rgba(255,255,255,0.7)",
						fontWeight: 600,
					}}
				>
					Sliding window
				</span>
			</label>
			<p
				style={{
					fontSize: 11,
					color: "rgba(255,255,255,0.3)",
					margin: "6px 0 0 22px",
					lineHeight: 1.5,
				}}
			>
				Split large pages into overlapping chunks and run the LLM on each.
			</p>
			{enabled && (
				<div style={{ marginTop: 10, marginLeft: 22 }}>
					<div style={fieldLabel}>Chunk size (chars)</div>
					<input
						type="number"
						value={chunkSize}
						onInput={(e) =>
							onChunkSizeChange((e.target as HTMLInputElement).value)
						}
						style={{ ...inp, width: 120 }}
						min={1000}
						step={500}
					/>
				</div>
			)}
		</div>
	);
}

function ConfigRow({
	cfg,
	onSave,
	onDelete,
}: {
	cfg: PromptConfig;
	onSave: (
		id: number,
		fields: {
			urlPattern: string;
			prompt: string;
			slidingWindow: boolean;
			chunkSize: number | null;
			debug: boolean;
			cheerio: PromptConfig["cheerio"];
		},
	) => Promise<void>;
	onDelete: (id: number) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [pattern, setPattern] = useState(cfg.urlPattern);
	const [prompt, setPrompt] = useState(cfg.prompt);
	const [slidingWindow, setSlidingWindow] = useState(cfg.slidingWindow);
	const [chunkSize, setChunkSize] = useState(String(cfg.chunkSize ?? 6000));
	const [debug, setDebug] = useState(!!cfg.debug);
	const [selector, setSelector] = useState(cfg.cheerio?.selector ?? "");
	const [stripTags, setStripTags] = useState(cfg.cheerio?.stripTags ?? "");
	const [textOnly, setTextOnly] = useState(!!cfg.cheerio?.textOnly);
	const [saving, setSaving] = useState(false);
	const [suggesting, setSuggesting] = useState(false);

	async function save() {
		setSaving(true);
		try {
			await onSave(cfg.id, {
				urlPattern: pattern,
				prompt,
				slidingWindow,
				chunkSize: slidingWindow ? Number(chunkSize) || 6000 : null,
				debug,
				cheerio: { selector, stripTags, textOnly },
			});
			setEditing(false);
		} finally {
			setSaving(false);
		}
	}

	async function handleSuggest() {
		const url = pattern.replace(/\*$/, "");
		if (!url.startsWith("http")) {
			alert("Please enter a valid URL in the pattern field.");
			return;
		}
		setSuggesting(true);
		try {
			const res = await suggestPrompt(url);
			setPrompt(res.prompt);
			if (res.cheerio) {
				setSelector(res.cheerio.selector ?? "");
				setStripTags(res.cheerio.stripTags ?? "");
				setTextOnly(!!res.cheerio.textOnly);
			}
		} catch (e) {
			alert(`Failed: ${String(e)}`);
		} finally {
			setSuggesting(false);
		}
	}

	function cancel() {
		setEditing(false);
		setPattern(cfg.urlPattern);
		setPrompt(cfg.prompt);
		setSlidingWindow(cfg.slidingWindow);
		setChunkSize(String(cfg.chunkSize ?? 6000));
		setDebug(!!cfg.debug);
		setSelector(cfg.cheerio?.selector ?? "");
		setStripTags(cfg.cheerio?.stripTags ?? "");
		setTextOnly(!!cfg.cheerio?.textOnly);
	}

	return (
		<div
			style={{
				border: "1px solid rgba(255,255,255,0.08)",
				borderRadius: 8,
				padding: "12px 14px",
				background: "rgba(255,255,255,0.02)",
			}}
		>
			{editing ? (
				<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
					<div>
						<div style={fieldLabel}>URL Pattern</div>
						<input
							value={pattern}
							onInput={(e) => setPattern((e.target as HTMLInputElement).value)}
							style={inp}
						/>
					</div>
					<div>
						<div style={fieldLabel}>Prompt</div>
						<textarea
							value={prompt}
							onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
							rows={6}
							style={ta}
						/>
						<button
							onClick={handleSuggest}
							disabled={suggesting}
							style={{ ...smallBtn(), marginTop: 6 }}
						>
							{suggesting ? "Analyzing..." : "🪄 Suggest Settings"}
						</button>
					</div>

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 10,
							alignItems: "start",
						}}
					>
						<CheerioFields
							selector={selector}
							stripTags={stripTags}
							textOnly={textOnly}
							onSelectorChange={setSelector}
							onStripTagsChange={setStripTags}
							onTextOnlyChange={setTextOnly}
						/>
						<SlidingWindowFields
							enabled={slidingWindow}
							chunkSize={chunkSize}
							onEnabledChange={setSlidingWindow}
							onChunkSizeChange={setChunkSize}
						/>
					</div>

					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: 8,
							cursor: "pointer",
							fontSize: 12,
							color: "rgba(255,255,255,0.5)",
						}}
					>
						<input
							type="checkbox"
							checked={debug}
							onChange={(e) => setDebug((e.target as HTMLInputElement).checked)}
						/>
						Debug mode (logs to pipeline logs)
					</label>
					<div style={{ display: "flex", gap: 8 }}>
						<button onClick={save} disabled={saving} style={smallBtn("primary")}>
							{saving ? "Saving…" : "Save"}
						</button>
						<button onClick={cancel} style={smallBtn()}>
							Cancel
						</button>
					</div>
				</div>
			) : (
				<div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
					<div style={{ flex: 1, minWidth: 0 }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 4,
							}}
						>
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: "#74c0fc",
									fontFamily: "monospace",
								}}
							>
								{cfg.urlPattern}
							</div>
							{cfg.cheerio?.selector && (
								<span
									style={{
										fontSize: 10,
										padding: "1px 5px",
										background: "rgba(116,192,252,0.1)",
										color: "#74c0fc",
										borderRadius: 4,
									}}
								>
									{cfg.cheerio.selector}
								</span>
							)}
						</div>
						<div
							style={{
								fontSize: 12,
								color: "rgba(255,255,255,0.35)",
								lineHeight: 1.5,
							}}
						>
							{cfg.prompt.slice(0, 100)}...
						</div>
					</div>
					<div style={{ display: "flex", gap: 6 }}>
						<button
							onClick={() => setEditing(true)}
							style={smallBtn()}
						>
							Edit
						</button>
						<button
							onClick={() => onDelete(cfg.id)}
							style={smallBtn("danger")}
						>
							Delete
						</button>
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
	const [newSelector, setNewSelector] = useState("");
	const [newStripTags, setNewStripTags] = useState("");
	const [newTextOnly, setNewTextOnly] = useState(false);

	const [showDefault, setShowDefault] = useState(false);
	const [suggesting, setSuggesting] = useState(false);

	useEffect(() => {
		getPromptConfigs()
			.then((d) => {
				setConfigs(d.configs);
				setDefaultPrompt(d.defaultPrompt);
				setNewPrompt(d.defaultPrompt);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	async function handleCreate(e: Event) {
		e.preventDefault();
		if (!newPattern.trim() || !newPrompt.trim()) return;
		const cfg = await createPromptConfig(newPattern.trim(), newPrompt.trim(), {
			slidingWindow: newSlidingWindow || undefined,
			chunkSize: newSlidingWindow ? Number(newChunkSize) || 6000 : undefined,
			debug: newDebug || undefined,
			cheerio: {
				selector: newSelector || undefined,
				stripTags: newStripTags || undefined,
				textOnly: newTextOnly || undefined,
			},
		});
		setConfigs((prev) => [cfg, ...prev]);
		resetForm();
		setAdding(false);
	}

	function resetForm() {
		setNewPattern("");
		setNewPrompt(defaultPrompt);
		setNewSlidingWindow(false);
		setNewChunkSize("6000");
		setNewDebug(false);
		setNewSelector("");
		setNewStripTags("");
		setNewTextOnly(false);
	}

	async function handleSuggest() {
		const url = newPattern.replace(/\*$/, "");
		if (!url.startsWith("http")) {
			alert("Please enter a valid URL first.");
			return;
		}
		setSuggesting(true);
		try {
			const res = await suggestPrompt(url);
			setNewPrompt(res.prompt);
			if (res.cheerio) {
				setNewSelector(res.cheerio.selector ?? "");
				setNewStripTags(res.cheerio.stripTags ?? "");
				setNewTextOnly(!!res.cheerio.textOnly);
			}
		} catch (e) {
			alert(`Failed: ${String(e)}`);
		} finally {
			setSuggesting(false);
		}
	}

	async function handleSave(id: number, fields: any) {
		const updated = await updatePromptConfig(id, fields);
		setConfigs((prev) => prev.map((c) => (c.id === id ? updated : c)));
	}

	async function handleDelete(id: number) {
		if (!confirm("Delete?")) return;
		await deletePromptConfig(id);
		setConfigs((prev) => prev.filter((c) => c.id !== id));
	}

	if (loading)
		return (
			<p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Loading…</p>
		);

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
			<p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0 }}>
				Configure extraction rules and content filtering per URL pattern.
			</p>

			{configs.map((cfg) => (
				<ConfigRow
					key={cfg.id}
					cfg={cfg}
					onSave={handleSave}
					onDelete={handleDelete}
				/>
			))}

			{adding ? (
				<form
					onSubmit={handleCreate}
					style={{
						border: "1px solid rgba(34,139,230,0.25)",
						borderRadius: 8,
						padding: "12px 14px",
						background: "rgba(34,139,230,0.04)",
						display: "flex",
						flexDirection: "column",
						gap: 12,
					}}
				>
					<div>
						<div style={fieldLabel}>URL Pattern</div>
						<input
							value={newPattern}
							onInput={(e) =>
								setNewPattern((e.target as HTMLInputElement).value)
							}
							style={inp}
							placeholder="https://example.com/*"
							autoFocus
						/>
					</div>
					<div>
						<div style={fieldLabel}>Prompt</div>
						<textarea
							value={newPrompt}
							onInput={(e) =>
								setNewPrompt((e.target as HTMLTextAreaElement).value)
							}
							rows={6}
							style={ta}
						/>
						<button
							type="button"
							onClick={handleSuggest}
							disabled={suggesting}
							style={{ ...smallBtn(), marginTop: 6 }}
						>
							{suggesting ? "Analyzing..." : "🪄 Suggest Settings"}
						</button>
					</div>

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 10,
							alignItems: "start",
						}}
					>
						<CheerioFields
							selector={newSelector}
							stripTags={newStripTags}
							textOnly={newTextOnly}
							onSelectorChange={setNewSelector}
							onStripTagsChange={setNewStripTags}
							onTextOnlyChange={setNewTextOnly}
						/>
						<SlidingWindowFields
							enabled={newSlidingWindow}
							chunkSize={newChunkSize}
							onEnabledChange={setNewSlidingWindow}
							onChunkSizeChange={setNewChunkSize}
						/>
					</div>

					<div style={{ display: "flex", gap: 8 }}>
						<button type="submit" style={smallBtn("primary")}>
							Create
						</button>
						<button
							type="button"
							onClick={() => setAdding(false)}
							style={smallBtn()}
						>
							Cancel
						</button>
					</div>
				</form>
			) : (
				<button
					onClick={() => setAdding(true)}
					style={{
						padding: "10px",
						borderRadius: 8,
						border: "1px dashed rgba(255,255,255,0.15)",
						background: "transparent",
						color: "rgba(255,255,255,0.4)",
						cursor: "pointer",
					}}
				>
					+ Add Extraction Rule
				</button>
			)}
		</div>
	);
}
