import { useState, useEffect } from "preact/hooks";
import { getReminders, createReminder, deleteReminder } from "../lib/api.js";
import { formatTime } from "../lib/format.js";
import type { StoredReminder } from "@impact/shared";

const card = { background: "#1e2d50", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" };
const input = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#e2e8f0", fontSize: 14, padding: "8px 12px", outline: "none", width: "100%", boxSizing: "border-box" as const };

export function ReminderManager() {
	const [reminders, setReminders] = useState<StoredReminder[]>([]);
	const [loading, setLoading]     = useState(true);
	const [showForm, setShowForm]   = useState(false);

	useEffect(() => { load(); }, []);

	async function load() {
		try { const d = await getReminders(); setReminders(d.reminders); }
		catch {} finally { setLoading(false); }
	}

	async function handleDelete(id: number) {
		await deleteReminder(id);
		setReminders(prev => prev.filter(r => r.id !== id));
	}

	const pending = reminders.filter(r => r.status === "pending");
	const past    = reminders.filter(r => r.status !== "pending");

	const sectionLabel = { fontSize: 11, fontWeight: 700 as const, color: "rgba(255,255,255,0.3)", marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.06em", display: "block" };

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
				<button onClick={() => setShowForm(!showForm)} style={{ padding: "8px 16px", background: showForm ? "rgba(255,255,255,0.07)" : "#228be6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
					{showForm ? "Cancel" : "+ New Reminder"}
				</button>
			</div>

			{showForm && <NewReminderForm onCreated={r => { setReminders(prev => [r, ...prev]); setShowForm(false); }} />}
			{loading && <p style={{ color: "rgba(255,255,255,0.35)" }}>Loading...</p>}
			{!loading && pending.length === 0 && !showForm && (
				<div style={{ ...card, padding: "32px", textAlign: "center" }}>
					<p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>No reminders yet.</p>
				</div>
			)}

			{pending.length > 0 && (
				<div style={{ marginBottom: 20 }}>
					<span style={sectionLabel}>Upcoming</span>
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{pending.map(r => <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />)}
					</div>
				</div>
			)}
			{past.length > 0 && (
				<div>
					<span style={sectionLabel}>Past</span>
					<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
						{past.map(r => <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />)}
					</div>
				</div>
			)}
		</div>
	);
}

function ReminderCard({ reminder: r, onDelete }: { reminder: StoredReminder; onDelete: (id: number) => void }) {
	const isPast = r.remindAt < Date.now();
	return (
		<div style={{ ...card, padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start", opacity: isPast ? 0.55 : 1 }}>
			<div style={{ flex: 1 }}>
				<p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: "#e2e8f0" }}>{r.title}</p>
				{r.note && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>{r.note}</p>}
				{r.url && (
					<a href={r.url} target="_blank" rel="noopener noreferrer"
						style={{ fontSize: 11, color: "#74c0fc", display: "block", marginTop: 4 }}>{r.url}</a>
				)}
				<p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "6px 0 0" }}>
					{isPast ? "Was due" : "Due"}: {formatTime(r.remindAt)}
				</p>
			</div>
			<button onClick={() => onDelete(r.id)} style={{ padding: "4px 10px", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 6, background: "rgba(255,107,107,0.1)", color: "#ff8f8f", cursor: "pointer", fontSize: 12 }}>
				Delete
			</button>
		</div>
	);
}

function NewReminderForm({ onCreated }: { onCreated: (r: StoredReminder) => void }) {
	const [title,    setTitle]    = useState("");
	const [note,     setNote]     = useState("");
	const [url,      setUrl]      = useState("");
	const [remindAt, setRemindAt] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
	const [saving,   setSaving]   = useState(false);

	async function submit(e: Event) {
		e.preventDefault();
		if (!title.trim()) return;
		setSaving(true);
		try {
			const data = await createReminder({ title: title.trim(), note: note.trim() || undefined, url: url.trim() || undefined, remindAt: new Date(remindAt).getTime() });
			onCreated(data.reminder);
		} finally { setSaving(false); }
	}

	return (
		<form onSubmit={submit} style={{ ...card, padding: "16px", marginBottom: 14 }}>
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				<input required placeholder="Title *" value={title} onInput={e => setTitle((e.target as HTMLInputElement).value)} style={input} />
				<input placeholder="Note (optional)" value={note} onInput={e => setNote((e.target as HTMLInputElement).value)} style={input} />
				<input placeholder="URL (optional)" value={url} onInput={e => setUrl((e.target as HTMLInputElement).value)} style={input} />
				<input type="datetime-local" value={remindAt} onInput={e => setRemindAt((e.target as HTMLInputElement).value)} style={input} />
				<button type="submit" disabled={saving} style={{ padding: "10px", background: "#228be6", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
					{saving ? "Saving..." : "Create Reminder"}
				</button>
			</div>
		</form>
	);
}
