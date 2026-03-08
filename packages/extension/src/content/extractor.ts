import type { Extraction } from "@impact/shared";
import { extensions } from "./registry.js";

const DOMAIN_BLOCKLIST = new Set([
	"google.com", "www.google.com",
	"bing.com", "www.bing.com",
	"duckduckgo.com", "mail.google.com",
	"localhost", "127.0.0.1",
	"accounts.google.com",
]);

export function runExtraction(): Extraction[] {
	if (DOMAIN_BLOCKLIST.has(location.hostname)) return [];

	const ctx = { url: location.href, now: Date.now() };
	return extensions.flatMap(extract => extract(ctx));
}

export function buildSnapshot(extractions: Extraction[]): Record<string, unknown> {
	const snap: Record<string, unknown> = {};

	const price = extractions.find(e => e.kind === "price");
	if (price) {
		const m = price.metadata ? JSON.parse(price.metadata) : {};
		if (m.price != null) snap.price = String(m.price);
		if (m.currency) snap.currency = m.currency;
		if (m.name) snap.name = m.name;
		if (m.availability) snap.availability = m.availability;
	}

	const keyword = extractions.find(e => e.kind === "keyword");
	if (keyword) {
		const parts = keyword.value.split(" — ");
		snap.title = parts[0];
		if (parts[1]) snap.description = parts[1];
	}

	const deadlines = extractions.filter(e => e.kind === "deadline");
	if (deadlines.length > 0) {
		snap.deadlines = deadlines.map(d => {
			const m = d.metadata ? JSON.parse(d.metadata) : {};
			return { value: d.value, iso: m.iso ?? null };
		});
	}

	return snap;
}
