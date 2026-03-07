import { useState, useEffect } from "preact/hooks";
import { getReminders, createReminder, deleteReminder } from "../lib/api.js";
import { formatTime } from "../lib/format.js";
import type { StoredReminder } from "@impact/shared";

export function ReminderManager() {
	const [reminders, setReminders] = useState<StoredReminder[]>([]);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false);

	useEffect(() => { load(); }, []);

	async function load() {
		try {
			const data = await getReminders();
			setReminders(data.reminders);
		} catch {
		} finally {
			setLoading(false);
		}
	}

	async function handleDelete(id: number) {
		await deleteReminder(id);
		setReminders(prev => prev.filter(r => r.id !== id));
	}

	const pending = reminders.filter(r => r.status === "pending");
	const past = reminders.filter(r => r.status !== "pending");

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
				<button
					onClick={() => setShowForm(!showForm)}
					style={{
						padding: "8px 16px", background: "#228be6", color: "white",
						border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14,
					}}
				>
					{showForm ? "Cancel" : "+ New Reminder"}
				</button>
			</div>

			{showForm && <NewReminderForm onCreated={(r) => { setReminders(prev => [r, ...prev]); setShowForm(false); }} />}

			{loading && <p style={{ color: "#868e96" }}>Loading...</p>}

			{!loading && pending.length === 0 && !showForm && (
				<div style={{ padding: "32px", textAlign: "center", background: "white", borderRadius: 10, border: "1px solid #e9ecef" }}>
					<p style={{ color: "#868e96", fontSize: 14 }}>No reminders yet. Create one to remember something later.</p>
				</div>
			)}

			{pending.length > 0 && (
				<div style={{ marginBottom: 24 }}>
					<h3 style={{ fontSize: 13, fontWeight: 600, color: "#868e96", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Upcoming</h3>
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
						{pending.map(r => <ReminderCard key={r.id} reminder={r} onDelete={handleDelete} />)}
					</div>
				</div>
			)}

			{past.length > 0 && (
				<div>
					<h3 style={{ fontSize: 13, fontWeight: 600, color: "#868e96", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Past</h3>
					<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
		<div style={{
			background: "white", borderRadius: 10, border: "1px solid #e9ecef",
			padding: "12px 14px", display: "flex", gap: 12, alignItems: "flex-start",
			opacity: isPast ? 0.6 : 1,
		}}>
			<div style={{ flex: 1 }}>
				<p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{r.title}</p>
				{r.note && <p style={{ fontSize: 13, color: "#868e96", margin: "4px 0 0" }}>{r.note}</p>}
				{r.url && (
					<a href={r.url} target="_blank" rel="noopener noreferrer"
						style={{ fontSize: 12, color: "#1c7ed6", display: "block", marginTop: 4 }}>
						{r.url}
					</a>
				)}
				<p style={{ fontSize: 12, color: "#adb5bd", margin: "6px 0 0" }}>
					{isPast ? "Was due" : "Due"}: {formatTime(r.remindAt)}
				</p>
			</div>
			<button
				onClick={() => onDelete(r.id)}
				style={{ padding: "4px 10px", border: "none", borderRadius: 6, background: "#fff0f0", color: "#ff6b6b", cursor: "pointer", fontSize: 13 }}
			>
				Delete
			</button>
		</div>
	);
}

function NewReminderForm({ onCreated }: { onCreated: (r: StoredReminder) => void }) {
	const [title, setTitle] = useState("");
	const [note, setNote] = useState("");
	const [url, setUrl] = useState("");
	const [remindAt, setRemindAt] = useState(() => {
		const d = new Date(Date.now() + 86400000);
		return d.toISOString().slice(0, 16);
	});
	const [saving, setSaving] = useState(false);

	async function submit(e: Event) {
		e.preventDefault();
		if (!title.trim()) return;
		setSaving(true);
		try {
			const data = await createReminder({
				title: title.trim(),
				note: note.trim() || undefined,
				url: url.trim() || undefined,
				remindAt: new Date(remindAt).getTime(),
			});
			onCreated(data.reminder);
		} finally {
			setSaving(false);
		}
	}

	const inputStyle = {
		width: "100%", padding: "8px 12px", border: "1px solid #dee2e6",
		borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" as const,
	};

	return (
		<form onSubmit={submit} style={{ background: "white", borderRadius: 10, border: "1px solid #e9ecef", padding: "16px", marginBottom: 16 }}>
			<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				<input required placeholder="Title *" value={title} onInput={e => setTitle((e.target as HTMLInputElement).value)} style={inputStyle} />
				<input placeholder="Note (optional)" value={note} onInput={e => setNote((e.target as HTMLInputElement).value)} style={inputStyle} />
				<input placeholder="URL (optional)" value={url} onInput={e => setUrl((e.target as HTMLInputElement).value)} style={inputStyle} />
				<input type="datetime-local" value={remindAt} onInput={e => setRemindAt((e.target as HTMLInputElement).value)} style={inputStyle} />
				<button type="submit" disabled={saving} style={{
					padding: "10px", background: "#228be6", color: "white",
					border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14,
				}}>
					{saving ? "Saving..." : "Create Reminder"}
				</button>
			</div>
		</form>
	);
}
