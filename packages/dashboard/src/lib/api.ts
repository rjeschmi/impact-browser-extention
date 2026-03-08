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

export async function updateSettings(settings: { ollamaModel?: string }) {
	const res = await fetch(`${BACKEND_URL}/api/settings`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(settings),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
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
		committed: { id: number; version: string; data: string; pageText: string | null; committedAt: number | null } | null;
		pending: { id: number; version: string; data: string; pageText: string | null; capturedAt: number } | null;
		changed: boolean;
	}>("/api/snapshots", { url });
}

export async function getSnapshots(params: { domain?: string; url?: string; limit?: string }) {
	return get<{ snapshots: { id: number; url: string; domain: string; version: string; status: string; capturedAt: number; committedAt: number | null }[] }>(
		"/api/snapshots/list",
		params as Record<string, string>,
	);
}

export async function cleanupSnapshot(url: string, targetKey?: string): Promise<{ pendingId?: number; version?: string; autoCommitted?: boolean; error?: string }> {
	const res = await fetch(`${BACKEND_URL}/api/snapshots/cleanup`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, ...(targetKey ? { targetKey } : {}) }),
	});
	const data = await res.json() as { pendingId?: number; version?: string; autoCommitted?: boolean; error?: string };
	if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
	return data;
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
export type PromptConfig = { 
	id: number; 
	urlPattern: string; 
	prompt: string; 
	slidingWindow: boolean; 
	chunkSize: number | null; 
	debug: boolean; 
	cheerio: { selector?: string; stripTags?: string; textOnly?: boolean };
	createdAt: number; 
	updatedAt: number 
};

export async function getPromptConfigs() {
	return get<{ configs: PromptConfig[]; defaultPrompt: string }>("/api/prompt-configs");
}

export async function suggestPrompt(url: string): Promise<{ prompt: string; cheerio: { selector?: string; stripTags?: string; textOnly?: boolean } }> {
	const res = await fetch(`${BACKEND_URL}/api/prompt-configs/suggest`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url }),
	});
	if (!res.ok) {
		const data = await res.json() as { error?: string };
		throw new Error(data.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export async function createPromptConfig(urlPattern: string, prompt: string, extras?: { slidingWindow?: boolean; chunkSize?: number; debug?: boolean; cheerio?: PromptConfig["cheerio"] }): Promise<PromptConfig> {
	const res = await fetch(`${BACKEND_URL}/api/prompt-configs`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ urlPattern, prompt, ...extras }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function updatePromptConfig(id: number, update: { urlPattern?: string; prompt?: string; slidingWindow?: boolean; chunkSize?: number | null; debug?: boolean; cheerio?: PromptConfig["cheerio"] }): Promise<PromptConfig> {
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

export async function getPluginLogs(snapshotId: number) {
	return get<{ logs: { id: number; pluginName: string; durationMs: number; inputData: string | null; outputData: string | null; error: string | null }[] }>(
		"/api/plugin-logs",
		{ snapshotId: String(snapshotId) },
	);
}

export async function getSnapshotHtml(url: string): Promise<{ structuredContent: string | null; pageText: string | null; hasHtml: boolean }> {
	return get("/api/snapshots/html", { url });
}

// Plugin configs
export type PluginConfig = {
	id: number;
	pluginName: string;
	urlPattern: string;
	enabled: boolean;
	config: string | null;
	priority: number;
	createdAt: number;
	updatedAt: number;
};

export async function getPluginConfigs() {
	return get<{ configs: PluginConfig[] }>("/api/plugin-configs");
}

export async function createPluginConfig(data: { pluginName: string; urlPattern: string; enabled?: boolean; config?: Record<string, unknown>; priority?: number }): Promise<PluginConfig> {
	const res = await fetch(`${BACKEND_URL}/api/plugin-configs`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function updatePluginConfig(id: number, data: { urlPattern?: string; enabled?: boolean; config?: Record<string, unknown>; priority?: number }): Promise<PluginConfig> {
	const res = await fetch(`${BACKEND_URL}/api/plugin-configs/${id}`, {
		method: "PATCH",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function deletePluginConfig(id: number): Promise<void> {
	const res = await fetch(`${BACKEND_URL}/api/plugin-configs/${id}`, { method: "DELETE" });
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

// Registry types
export interface RegistryLabel {
	id: number;
	urlPattern: string;
	label: string;
	description: string | null;
	contributor: string;
	lastPushedAt: number | null;
	createdAt: number;
	updatedAt: number;
}

export interface RegistryEntry {
	id: number;
	urlPattern: string;
	domain: string;
	label: string;
	description: string | null;
	contributor: string;
	pushedAt: number;
	pushCount: number;
	configBundle: string;
}

// Registry labels (backend)
export async function getRegistryLabels(): Promise<{ labels: RegistryLabel[] }> {
	return get("/api/registry/labels");
}

export async function upsertRegistryLabel(data: {
	urlPattern: string;
	label: string;
	description?: string;
	contributor?: string;
}): Promise<RegistryLabel> {
	const res = await fetch(`${BACKEND_URL}/api/registry/labels`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

export async function deleteRegistryLabel(id: number): Promise<void> {
	const res = await fetch(`${BACKEND_URL}/api/registry/labels/${id}`, { method: "DELETE" });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function pushToRegistry(labelId: number): Promise<{ ok: boolean; entry: unknown }> {
	const res = await fetch(`${BACKEND_URL}/api/registry/labels/${labelId}/push`, { method: "POST" });
	if (!res.ok) {
		const data = await res.json() as { error?: string };
		throw new Error(data.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

export async function browseRegistryEntry(id: number): Promise<RegistryEntry & { sampleData: string | null }> {
	return get(`/api/registry/browse/${id}`);
}

export async function browseRegistry(q?: string): Promise<{ entries: RegistryEntry[] }> {
	const params: Record<string, string> = {};
	if (q) params.q = q;
	return get("/api/registry/browse", params);
}

export async function importFromRegistry(entryId: number): Promise<{ ok: boolean; imported: { promptConfigs: number; pluginConfigs: number } }> {
	const res = await fetch(`${BACKEND_URL}/api/registry/import`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ entryId }),
	});
	if (!res.ok) {
		const data = await res.json() as { error?: string };
		throw new Error(data.error ?? `HTTP ${res.status}`);
	}
	return res.json();
}

// LLM Stats
export interface LlmStatRow {
	model: string;
	operation: string;
	calls: number;
	successCalls: number;
	avgWallMs: number;
	avgEvalMs: number | null;
	totalPromptTokens: number | null;
	totalCompletionTokens: number | null;
	avgCompletionTokens: number | null;
	avgPromptChars: number;
}

export interface LlmTotals {
	totalCalls: number;
	totalSuccess: number;
	totalPromptTokens: number | null;
	totalCompletionTokens: number | null;
	avgWallMs: number;
}

export interface LlmStatCall {
	id: number;
	model: string;
	operation: string;
	url: string | null;
	pluginName: string | null;
	promptChars: number;
	responseChars: number;
	promptTokens: number | null;
	completionTokens: number | null;
	totalDurationMs: number | null;
	evalDurationMs: number | null;
	wallDurationMs: number;
	attempt: number;
	success: boolean;
	error: string | null;
	createdAt: number;
}

export async function getLlmStatsSummary(since?: number): Promise<{ summary: LlmStatRow[]; totals: LlmTotals }> {
	const params: Record<string, string> = {};
	if (since) params.since = String(since);
	return get("/api/llm-stats/summary", params);
}

export async function getLlmStatsRecent(limit?: number): Promise<{ calls: LlmStatCall[] }> {
	const params: Record<string, string> = {};
	if (limit) params.limit = String(limit);
	return get("/api/llm-stats/recent", params);
}

export async function clearLlmStats(): Promise<void> {
	const res = await fetch(`${BACKEND_URL}/api/llm-stats`, { method: "DELETE" });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
