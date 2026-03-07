import { BACKEND_URL, API_ROUTES } from "@impact/shared";
import type { StoredPageVisit, StoredSuggestion, StoredReminder } from "@impact/shared";

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
	const url = new URL(`${BACKEND_URL}${path}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	}
	const res = await fetch(url.toString());
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function getVisits(params?: { domain?: string; since?: string; limit?: string }) {
	return get<{ visits: StoredPageVisit[]; count: number }>(API_ROUTES.visits, params as Record<string, string>);
}

export async function getVisitStats(since?: string) {
	return get<{
		topDomains: { domain: string; visitCount: number; totalDuration: number }[];
		totalVisits: number;
		since: number;
	}>(API_ROUTES.visitsStats, since ? { since } : undefined);
}

export async function getSuggestions(status = "active") {
	return get<{ suggestions: StoredSuggestion[] }>(API_ROUTES.suggestions, { status });
}

export async function patchSuggestion(id: number, update: { status?: string; snoozedUntil?: number | null }) {
	const res = await fetch(`${BACKEND_URL}${API_ROUTES.suggestions}/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(update),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function getReminders() {
	return get<{ reminders: StoredReminder[] }>(API_ROUTES.reminders);
}

export async function createReminder(data: { url?: string; title: string; note?: string; remindAt: number }) {
	const res = await fetch(`${BACKEND_URL}${API_ROUTES.reminders}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function deleteReminder(id: number) {
	const res = await fetch(`${BACKEND_URL}${API_ROUTES.reminders}/${id}`, { method: "DELETE" });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

// Settings
export async function getSettings() {
	return get<{
		visits: number; extractions: number; suggestions: number; reminders: number;
		llmEnabled: boolean; ollamaModel: string;
	}>("/api/settings/stats");
}

export async function getBlocklist() {
	return get<{ blocklist: string[] }>("/api/settings/blocklist");
}

export async function addBlocklistDomain(domain: string) {
	const res = await fetch(`${BACKEND_URL}/api/settings/blocklist`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ domain }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json() as Promise<{ blocklist: string[] }>;
}

export async function removeBlocklistDomain(domain: string) {
	const res = await fetch(`${BACKEND_URL}/api/settings/blocklist/${encodeURIComponent(domain)}`, {
		method: "DELETE",
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json() as Promise<{ blocklist: string[] }>;
}

export async function purgeData(olderThanDays: number) {
	const res = await fetch(`${BACKEND_URL}/api/settings/purge`, {
		method: "DELETE",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ olderThanDays }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json() as Promise<{ deleted: { visits: number; extractions: number } }>;
}

export function getExportUrl() {
	return `${BACKEND_URL}/api/settings/export`;
}
