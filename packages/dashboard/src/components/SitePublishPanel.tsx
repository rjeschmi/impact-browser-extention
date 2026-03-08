import { useState, useEffect } from "preact/hooks";
import { getRegistryLabels, upsertRegistryLabel, pushToRegistry } from "../lib/api.js";
import type { RegistryLabel } from "../lib/api.js";
import { relativeTime } from "../lib/format.js";

const card = {
	background: "#1e2d50",
	borderRadius: "10px",
	border: "1px solid rgba(255,255,255,0.07)",
	padding: "16px",
};

const inputStyle = {
	background: "rgba(255,255,255,0.06)",
	border: "1px solid rgba(255,255,255,0.1)",
	borderRadius: "8px",
	color: "#e2e8f0",
	fontSize: 13,
	padding: "8px 12px",
	outline: "none",
	width: "100%",
	boxSizing: "border-box" as const,
};

const sectionLabel = {
	fontSize: 11,
	fontWeight: 700 as const,
	color: "rgba(255,255,255,0.35)",
	textTransform: "uppercase" as const,
	letterSpacing: "0.06em",
	display: "block",
	marginBottom: 10,
};

export function SitePublishPanel({ domain, url: _url }: { domain: string; url?: string }) {
	const [existingLabel, setExistingLabel] = useState<RegistryLabel | null>(null);
	const [labelText, setLabelText] = useState("");
	const [description, setDescription] = useState("");
	const [contributor, setContributor] = useState("");
	const [saving, setSaving] = useState(false);
	const [pushing, setPushing] = useState(false);
	const [saveMsg, setSaveMsg] = useState<string | null>(null);
	const [pushMsg, setPushMsg] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		getRegistryLabels()
			.then(({ labels }) => {
				const match = labels.find((l) => {
					try {
						const labelDomain = new URL(l.urlPattern.replace(/\*/g, "x")).hostname;
						return labelDomain === domain;
					} catch {
						return false;
					}
				}) ?? null;

				if (match) {
					setExistingLabel(match);
					setLabelText(match.label);
					setDescription(match.description ?? "");
					setContributor(match.contributor === "anonymous" ? "" : match.contributor);
				} else {
					// Default label from domain
					setLabelText(domain.charAt(0).toUpperCase() + domain.slice(1).split(".")[0] + " Pages");
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [domain]);

	async function handleSave(e: Event) {
		e.preventDefault();
		if (!labelText.trim()) return;
		setSaving(true);
		setSaveMsg(null);
		try {
			const urlPattern = existingLabel?.urlPattern ?? `https://${domain}/*`;
			const updated = await upsertRegistryLabel({
				urlPattern,
				label: labelText.trim(),
				description: description.trim() || undefined,
				contributor: contributor.trim() || undefined,
			});
			setExistingLabel(updated);
			setSaveMsg("Saved.");
		} catch (e) {
			setSaveMsg(`Error: ${String(e)}`);
		} finally {
			setSaving(false);
		}
	}

	async function handlePush() {
		if (!existingLabel) return;
		setPushing(true);
		setPushMsg(null);
		try {
			await pushToRegistry(existingLabel.id);
			const { labels } = await getRegistryLabels();
			const updated = labels.find((l) => l.id === existingLabel.id) ?? null;
			if (updated) setExistingLabel(updated);
			setPushMsg("Pushed to registry.");
		} catch (e) {
			setPushMsg(`Error: ${String(e)}`);
		} finally {
			setPushing(false);
		}
	}

	if (loading) return null;

	return (
		<div style={card}>
			<span style={sectionLabel}>Publish to Registry</span>
			<p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 12 }}>
				Share extraction configs for {domain} with the community registry.
			</p>

			<form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				<div>
					<label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>
						Label
					</label>
					<input
						type="text"
						placeholder="e.g. Amazon Product Pages"
						value={labelText}
						onInput={(e) => setLabelText((e.target as HTMLInputElement).value)}
						style={inputStyle}
					/>
				</div>

				<div>
					<label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>
						Description (optional)
					</label>
					<textarea
						placeholder="What does this config extract?"
						value={description}
						onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
						rows={2}
						style={{ ...inputStyle, resize: "vertical" as const, fontFamily: "inherit" }}
					/>
				</div>

				<div>
					<label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 4 }}>
						Contributor (optional)
					</label>
					<input
						type="text"
						placeholder="Your name or handle"
						value={contributor}
						onInput={(e) => setContributor((e.target as HTMLInputElement).value)}
						style={inputStyle}
					/>
				</div>

				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
					<button
						type="submit"
						disabled={saving || !labelText.trim()}
						style={{
							padding: "7px 16px",
							background: "#228be6",
							color: "white",
							border: "none",
							borderRadius: 8,
							cursor: saving || !labelText.trim() ? "default" : "pointer",
							fontSize: 13,
							fontWeight: 600,
							opacity: saving || !labelText.trim() ? 0.6 : 1,
						}}
					>
						{saving ? "Saving…" : "Save"}
					</button>

					{existingLabel && (
						<button
							type="button"
							onClick={handlePush}
							disabled={pushing}
							style={{
								padding: "7px 16px",
								background: pushing ? "rgba(81,207,102,0.15)" : "rgba(81,207,102,0.1)",
								color: "#51cf66",
								border: "1px solid rgba(81,207,102,0.25)",
								borderRadius: 8,
								cursor: pushing ? "default" : "pointer",
								fontSize: 13,
								fontWeight: 600,
								opacity: pushing ? 0.6 : 1,
							}}
						>
							{pushing ? "Pushing…" : "Push to Registry"}
						</button>
					)}

					{existingLabel?.lastPushedAt && (
						<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
							Last pushed {relativeTime(existingLabel.lastPushedAt)}
						</span>
					)}
				</div>

				{saveMsg && (
					<p style={{ fontSize: 12, color: saveMsg.startsWith("Error") ? "#ff8f8f" : "#51cf66", margin: 0 }}>
						{saveMsg}
					</p>
				)}
				{pushMsg && (
					<p style={{ fontSize: 12, color: pushMsg.startsWith("Error") ? "#ff8f8f" : "#51cf66", margin: 0 }}>
						{pushMsg}
					</p>
				)}
			</form>
		</div>
	);
}
