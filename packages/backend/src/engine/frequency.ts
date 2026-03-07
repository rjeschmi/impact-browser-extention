import type { Analyzer } from "./index.js";
import { sql, gte } from "drizzle-orm";
import { schema } from "../db/client.js";

// Generic domains we should never surface suggestions for
const BLOCKLIST = new Set([
	"google.com", "www.google.com",
	"bing.com", "www.bing.com",
	"duckduckgo.com",
	"localhost", "127.0.0.1",
	"newtab", "",
]);

export const frequencyAnalyzer: Analyzer = {
	name: "frequency",

	run(db) {
		const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

		const rows = db
			.select({
				domain: schema.pageVisits.domain,
				visitCount: sql<number>`count(*)`.as("visit_count"),
				lastUrl: sql<string>`max(${schema.pageVisits.url})`.as("last_url"),
				lastTitle: sql<string>`max(${schema.pageVisits.title})`.as("last_title"),
			})
			.from(schema.pageVisits)
			.where(gte(schema.pageVisits.visitedAt, since))
			.groupBy(schema.pageVisits.domain)
			.having(sql`count(*) >= 5`)
			.all();

		return rows
			.filter(r => !BLOCKLIST.has(r.domain))
			.map(r => ({
				type: "frequent" as const,
				title: `You visit ${r.domain} frequently`,
				body: `${r.visitCount} visits in the last 7 days. Consider bookmarking or setting a reminder.`,
				url: r.lastUrl,
				priority: Math.min(5, Math.floor(r.visitCount / 5)),
				sourceAnalyzer: "frequency",
			}));
	},
};
