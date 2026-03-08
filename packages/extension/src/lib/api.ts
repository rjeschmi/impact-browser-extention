import { BACKEND_URL, API_ROUTES } from "@impact/shared";
import type { PageVisit, Extraction } from "@impact/shared";

export async function sendVisits(visits: PageVisit[]): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.visits}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(visits),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function sendExtractions(extractions: Extraction[]): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.extractions}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(extractions),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function getBlocklist(): Promise<string[]> {
	try {
		const res = await fetch(`${BACKEND_URL}/api/settings/blocklist`);
		if (!res.ok) return [];
		const data = await res.json() as { blocklist: string[] };
		return data.blocklist;
	} catch {
		return [];
	}
}

export async function toggleBlocklist(domain: string, blocked: boolean): Promise<boolean> {
	try {
		const url = `${BACKEND_URL}/api/settings/blocklist${blocked ? "" : `/${encodeURIComponent(domain)}`}`;
		const res = await fetch(url, {
			method: blocked ? "POST" : "DELETE",
			headers: blocked ? { "Content-Type": "application/json" } : undefined,
			body: blocked ? JSON.stringify({ domain }) : undefined,
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function getExtractionsForUrl(url: string): Promise<{ id: number; kind: string; value: string; context: string | null; isPinned: boolean }[]> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.extractions}?url=${encodeURIComponent(url)}&limit=20`);
		if (!res.ok) return [];
		const data = await res.json() as { extractions: { id: number; kind: string; value: string; context: string | null; isPinned: boolean }[] };
		return data.extractions;
	} catch {
		return [];
	}
}

export async function pinExtraction(id: number, isPinned: boolean): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.extractions}/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ isPinned }),
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function getDomainSummary(domain: string): Promise<{ visits: number; extractions: number }> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.visitsDomainSummary}?domain=${encodeURIComponent(domain)}`);
		if (!res.ok) return { visits: 0, extractions: 0 };
		return res.json();
	} catch {
		return { visits: 0, extractions: 0 };
	}
}

export async function checkHealth(): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.health}`);
		return res.ok;
	} catch {
		return false;
	}
}

export async function submitSnapshot(url: string, domain: string, data: Record<string, unknown>, pageText?: string, pageHtml?: string): Promise<{ changed: boolean; pendingId?: number; autoCommitted?: boolean }> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.snapshots}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url, domain, data, pageText, pageHtml }),
		});
		if (!res.ok) return { changed: false };
		return res.json();
	} catch {
		return { changed: false };
	}
}

export async function promptSnapshot(url: string, userPrompt: string, pageText: string): Promise<{ result: Record<string, unknown>; pendingId: number; version: string } | { error: string }> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.snapshots}/prompt`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ url, userPrompt, pageText }),
		});
		const text = await res.text();
		let data: { result?: Record<string, unknown>; pendingId?: number; version?: string; error?: string };
		try { data = JSON.parse(text); } catch { return { error: `Bad response: ${text.slice(0, 200)}` }; }
		if (!res.ok) return { error: data.error ?? `Server error ${res.status}` };
		return data as { result: Record<string, unknown>; pendingId: number; version: string };
	} catch (e) {
		return { error: String(e) };
	}
}

export async function getSnapshot(url: string): Promise<{ committed: unknown; pending: unknown; changed: boolean }> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.snapshots}?url=${encodeURIComponent(url)}`);
		if (!res.ok) return { committed: null, pending: null, changed: false };
		return res.json();
	} catch {
		return { committed: null, pending: null, changed: false };
	}
}

export async function commitSnapshot(pendingId: number): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.snapshots}/${pendingId}/commit`, { method: "POST" });
		return res.ok;
	} catch {
		return false;
	}
}
