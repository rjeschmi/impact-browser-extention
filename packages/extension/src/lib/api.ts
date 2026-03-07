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

export async function checkHealth(): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}${API_ROUTES.health}`);
		return res.ok;
	} catch {
		return false;
	}
}
