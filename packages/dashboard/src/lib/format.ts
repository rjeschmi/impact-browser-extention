export function formatDuration(ms: number): string {
	if (ms < 1000) return "<1s";
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${s % 60}s`;
	const h = Math.floor(m / 60);
	return `${h}h ${m % 60}m`;
}

export function formatTime(ts: number): string {
	const d = new Date(ts);
	const now = new Date();
	const isToday = d.toDateString() === now.toDateString();
	if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
		" " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const m = Math.floor(diff / 60000);
	if (m < 1) return "just now";
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}

export function getFavicon(domain: string): string {
	return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}
