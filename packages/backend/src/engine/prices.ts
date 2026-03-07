import type { Analyzer } from "./index.js";
import { eq, desc } from "drizzle-orm";
import { schema } from "../db/client.js";

function parseAmount(value: string): number | null {
	const match = value.replace(/,/g, "").match(/[\d]+(?:\.\d+)?/);
	return match ? parseFloat(match[0]) : null;
}

export const priceAnalyzer: Analyzer = {
	name: "prices",

	run(db) {
		// Get latest 2 price extractions per URL, look for changes
		const rows = db
			.select()
			.from(schema.extractions)
			.where(eq(schema.extractions.kind, "price"))
			.orderBy(desc(schema.extractions.extractedAt))
			.limit(500)
			.all();

		// Group by URL, keep latest 2
		const byUrl = new Map<string, typeof rows>();
		for (const row of rows) {
			const group = byUrl.get(row.url) ?? [];
			if (group.length < 2) {
				group.push(row);
				byUrl.set(row.url, group);
			}
		}

		const results = [];
		for (const [url, [latest, previous]] of byUrl) {
			if (!previous) continue;
			const newAmt = parseAmount(latest.value);
			const oldAmt = parseAmount(previous.value);
			if (newAmt === null || oldAmt === null) continue;
			if (newAmt === oldAmt) continue;

			const diff = newAmt - oldAmt;
			const pct = Math.round(Math.abs(diff / oldAmt) * 100);
			if (pct < 2) continue; // ignore tiny fluctuations

			const direction = diff < 0 ? "dropped" : "increased";
			results.push({
				type: "price_change" as const,
				title: `Price ${direction} on ${new URL(url).hostname}`,
				body: `Was ${previous.value}, now ${latest.value} (${diff < 0 ? "-" : "+"}${pct}%)`,
				url,
				priority: diff < 0 ? 4 : 2,
				sourceAnalyzer: "prices",
			});
		}

		return results;
	},
};
