import { useState, useEffect } from "preact/hooks";
import {
	getSettings,
	updateSettings,
	getBlocklist,
	addBlocklistDomain,
	removeBlocklistDomain,
	purgeData,
	getExportUrl,
} from "../lib/api.js";
import { PromptConfigManager } from "./PromptConfigManager.js";

type Stats = {
	visits: number;
	extractions: number;
	suggestions: number;
	reminders: number;
	llmEnabled: boolean;
	ollamaModel: string;
};

const card = {
	background: "#1e2d50",
	borderRadius: "10px",
	border: "1px solid rgba(255,255,255,0.07)",
	padding: "16px",
	marginBottom: 12,
};
const input = {
	background: "rgba(255,255,255,0.06)",
	border: "1px solid rgba(255,255,255,0.1)",
	borderRadius: "8px",
	color: "#e2e8f0",
	fontSize: 14,
	padding: "8px 12px",
	outline: "none",
};
const label = {
	fontSize: 11,
	fontWeight: 700 as const,
	color: "rgba(255,255,255,0.35)",
	textTransform: "uppercase" as const,
	letterSpacing: "0.06em",
	display: "block",
	marginBottom: 10,
};

export function Settings() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [blocklist, setBlocklist] = useState<string[]>([]);
	const [newDomain, setNewDomain] = useState("");
	const [purging, setPurging] = useState(false);
	const [purgeDays, setPurgeDays] = useState(30);
	const [purgeResult, setPurgeResult] = useState<string | null>(null);

	useEffect(() => {
		getSettings()
			.then(setStats)
			.catch(() => {});
		getBlocklist()
			.then((d) => setBlocklist(d.blocklist))
			.catch(() => {});
	}, []);

	async function handleAddDomain(e: Event) {
		e.preventDefault();
		const domain = newDomain
			.trim()
			.replace(/^https?:\/\//, "")
			.split("/")[0];
		if (!domain) return;
		const data = await addBlocklistDomain(domain);
		setBlocklist(data.blocklist);
		setNewDomain("");
	}

	async function handleRemoveDomain(domain: string) {
		const data = await removeBlocklistDomain(domain);
		setBlocklist(data.blocklist);
	}

	async function handlePurge() {
		if (
			!confirm(
				`Delete all data older than ${purgeDays} days? This cannot be undone.`,
			)
		)
			return;
		setPurging(true);
		try {
			const result = await purgeData(purgeDays);
			setPurgeResult(
				`Deleted ${result.deleted.visits} visits and ${result.deleted.extractions} extractions.`,
			);
			getSettings()
				.then(setStats)
				.catch(() => {});
		} finally {
			setPurging(false);
		}
	}

	async function handleModelChange(model: string) {
		if (!stats) return;
		try {
			await updateSettings({ ollamaModel: model });
			setStats({ ...stats, ollamaModel: model });
		} catch (e) {
			alert(`Failed to update model: ${String(e)}`);
		}
	}

	const statItems = stats
		? [
				["Visits", stats.visits],
				["Extractions", stats.extractions],
				["Suggestions", stats.suggestions],
				["Reminders", stats.reminders],
			]
		: [];

	return (
		<div>
			{/* Stats */}
			<div style={card}>
				<span style={label}>Database</span>
				{stats ? (
					<div
						style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
					>
						{statItems.map(([l, n]) => (
							<div
								key={l}
								style={{
									padding: "10px 12px",
									background: "rgba(255,255,255,0.05)",
									borderRadius: 8,
								}}
							>
								<div
									style={{ fontSize: 22, fontWeight: 700, color: "#74c0fc" }}
								>
									{n}
								</div>
								<div
									style={{
										fontSize: 11,
										color: "rgba(255,255,255,0.35)",
										marginTop: 2,
									}}
								>
									{l}
								</div>
							</div>
						))}
					</div>
				) : (
					<p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
						Loading...
					</p>
				)}
			</div>

			{/* LLM */}
			<div style={card}>
				<span style={label}>AI Analysis (Ollama)</span>
				{stats && (
					<>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								flexWrap: "wrap",
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<div
									style={{
										width: 7,
										height: 7,
										borderRadius: "50%",
										background: stats.llmEnabled
											? "#51cf66"
											: "rgba(255,255,255,0.2)",
									}}
								/>
								<span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
									{stats.llmEnabled ? "Service Available" : "Service Unavailable"}
								</span>
							</div>

							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
									Model:
								</span>
								<select
									value={stats.ollamaModel}
									onChange={(e) =>
										handleModelChange((e.target as HTMLSelectElement).value)
									}
									style={{ ...input, padding: "4px 8px", fontSize: 12 }}
								>
									<option value="qwen2.5-coder:3b">
										Qwen 2.5 Coder 3B (Best for JSON)
									</option>
									<option value="llama3.2">Llama 3.2 3B</option>
									<option value="phi3.5">Phi 3.5 Mini</option>
									<option value="llama3.2:1b">Llama 3.2 1B (Fastest)</option>
								</select>
							</div>
						</div>
						<p
							style={{
								fontSize: 12,
								color: "rgba(255,255,255,0.3)",
								marginTop: 8,
							}}
						>
							Requires{" "}
							<code
								style={{
									background: "rgba(255,255,255,0.08)",
									padding: "1px 5px",
									borderRadius: 3,
									color: "#74c0fc",
								}}
							>
								IMPACT_LLM=1
							</code>{" "}
							and the selected model to be installed. Run:
							<code
								style={{
									display: "block",
									marginTop: 6,
									background: "rgba(0,0,0,0.2)",
									padding: "8px 10px",
									borderRadius: 6,
									color: "#ffd43b",
									fontFamily: "monospace",
								}}
							>
								ollama pull {stats.ollamaModel}
							</code>
						</p>
					</>
				)}
			</div>

			{/* Blocklist */}
			<div style={card}>
				<span style={label}>Domain Blocklist</span>
				<p
					style={{
						fontSize: 12,
						color: "rgba(255,255,255,0.35)",
						marginBottom: 12,
					}}
				>
					Domains skipped during tracking and analysis.
				</p>
				<form
					onSubmit={handleAddDomain}
					style={{ display: "flex", gap: 8, marginBottom: 10 }}
				>
					<input
						placeholder="example.com"
						value={newDomain}
						onInput={(e) => setNewDomain((e.target as HTMLInputElement).value)}
						style={{ ...input, flex: 1 }}
					/>
					<button
						type="submit"
						style={{
							padding: "8px 14px",
							background: "#228be6",
							color: "white",
							border: "none",
							borderRadius: 8,
							cursor: "pointer",
							fontSize: 13,
						}}
					>
						Add
					</button>
				</form>
				<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					{blocklist.map((d) => (
						<div
							key={d}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								padding: "6px 10px",
								background: "rgba(255,255,255,0.05)",
								borderRadius: 6,
							}}
						>
							<span style={{ fontSize: 13, color: "#e2e8f0" }}>{d}</span>
							<button
								onClick={() => handleRemoveDomain(d)}
								style={{
									padding: "2px 8px",
									background: "none",
									border: "1px solid rgba(255,255,255,0.1)",
									borderRadius: 4,
									cursor: "pointer",
									fontSize: 11,
									color: "rgba(255,255,255,0.4)",
								}}
							>
								Remove
							</button>
						</div>
					))}
				</div>
			</div>

			{/* Extraction Prompts */}
			<div style={card}>
				<span style={label}>Extraction Prompts</span>
				<PromptConfigManager />
			</div>

			{/* Export */}
			<div style={card}>
				<span style={label}>Export Data</span>
				<a
					href={getExportUrl()}
					download
					style={{
						display: "inline-block",
						padding: "8px 16px",
						background: "rgba(255,255,255,0.08)",
						color: "#e2e8f0",
						borderRadius: 8,
						fontSize: 13,
						textDecoration: "none",
						border: "1px solid rgba(255,255,255,0.1)",
					}}
				>
					Download export.json
				</a>
			</div>

			{/* Purge */}
			<div style={{ ...card, border: "1px solid rgba(255,107,107,0.2)" }}>
				<span style={{ ...label, color: "rgba(255,107,107,0.6)" }}>
					Danger Zone
				</span>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						flexWrap: "wrap" as const,
					}}
				>
					<span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
						Delete data older than
					</span>
					<select
						value={purgeDays}
						onChange={(e) =>
							setPurgeDays(Number((e.target as HTMLSelectElement).value))
						}
						style={{ ...input, padding: "6px 10px" }}
					>
						{[7, 14, 30, 60, 90].map((d) => (
							<option key={d} value={d}>
								{d} days
							</option>
						))}
					</select>
					<button
						onClick={handlePurge}
						disabled={purging}
						style={{
							padding: "8px 14px",
							background: "rgba(255,107,107,0.1)",
							color: "#ff8f8f",
							border: "1px solid rgba(255,107,107,0.25)",
							borderRadius: 8,
							cursor: "pointer",
							fontSize: 13,
						}}
					>
						{purging ? "Purging..." : "Purge"}
					</button>
				</div>
				{purgeResult && (
					<p style={{ fontSize: 12, color: "#51cf66", marginTop: 8 }}>
						{purgeResult}
					</p>
				)}
			</div>
		</div>
	);
}
