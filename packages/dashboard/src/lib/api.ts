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

export async function getExtractions(params?: { url?: string; domain?: string; kind?: string; since?: string; limit?: string }) {
	return get<{ extractions: import("@impact/shared").StoredExtraction[]; count: number }>(
		API_ROUTES.extractions,
		params as Record<string, string>,
	);
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

export async function patchExtraction(id: number, update: { isPinned: boolean }) {
	const res = await fetch(`${BACKEND_URL}${API_ROUTES.extractions}/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(update),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
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

export async function getSnapshotForUrl(url: string) {
	return get<{
		committed: { id: number; version: string; data: string; committedAt: number | null } | null;
		pending: { id: number; version: string; data: string; capturedAt: number } | null;
		changed: boolean;
	}>("/api/snapshots", { url });
}

export async function reextractSnapshot(url: string): Promise<{ pendingId?: number; version?: string; autoCommitted?: boolean; error?: string }> {
	const res = await fetch(`${BACKEND_URL}/api/snapshots/reextract`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url }),
	});
	const data = await res.json() as { pendingId?: number; version?: string; autoCommitted?: boolean; error?: string };
	if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
	return data;
}

export async function commitSnapshotById(id: number, data?: Record<string, unknown>): Promise<void> {
	const res = await fetch(`${BACKEND_URL}/api/snapshots/${id}/commit`, {
		method: "POST",
		headers: data ? { "Content-Type": "application/json" } : undefined,
		body: data ? JSON.stringify({ data }) : undefined,
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function askSnapshot(url: string, userPrompt: string, history: { role: string; content: string }[] = []) {
	const res = await fetch(`${BACKEND_URL}/api/snapshots/ask`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, userPrompt, history }),
	});
	const data = await res.json() as { answer?: string; error?: string };
	if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
	return data as { answer: string };
}

export async function searchSnapshots(q: string, limit = 10, minScore = 0.3) {
	return get<{ results: { url: string; domain: string; version: string; data: string; score: number }[]; totalIndexed: number }>(
		"/api/snapshots/search",
		{ q, limit: String(limit), min_score: String(minScore) }
	);
}

// Prompt configs
type PromptConfig = { id: number; urlPattern: string; prompt: string; createdAt: number; updatedAt: number };

export async function getPromptConfigs() {
	return get<{ configs: PromptConfig[]; defaultPrompt: string }>("/api/prompt-configs");
}

export async function createPromptConfig(urlPattern: string, prompt: string): Promise<PromptConfig> {
	const res = await fetch(`${BACKEND_URL}/api/prompt-configs`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ urlPattern, prompt }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function updatePromptConfig(id: number, update: { urlPattern?: string; prompt?: string }): Promise<PromptConfig> {
	const res = await fetch(`${BACKEND_URL}/api/prompt-configs/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(update),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function deletePromptConfig(id: number): Promise<void> {
	const res = await fetch(`${BACKEND_URL}/api/prompt-configs/${id}`, { method: "DELETE" });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function reindexSnapshots(force = false): Promise<{ indexed: number; total: number; errors: string[] }> {
	const res = await fetch(`${BACKEND_URL}/api/snapshots/reindex${force ? "?force=true" : ""}`, { method: "POST" });
	if (!res.ok) {
		const data = await res.json() as { error?: string };
		throw new Error(data.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}
