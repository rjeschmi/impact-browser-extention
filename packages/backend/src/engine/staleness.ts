import type { Analyzer } from "./index.js";
import { sql, lt, gte } from "drizzle-orm";
import { schema } from "../db/client.js";

const BLOCKLIST = new Set([
	"google.com", "www.google.com",
	"bing.com", "www.bing.com",
	"duckduckgo.com",
	"localhost", "127.0.0.1",
	"newtab", "",
]);

export const stalenessAnalyzer: Analyzer = {
	name: "staleness",

	run(db) {
		const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
		const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;

		// Domains visited 3+ times historically but not in last 14 days
		const rows = db
			.select({
				domain: schema.pageVisits.domain,
				visitCount: sql<number>`count(*)`.as("visit_count"),
				lastVisit: sql<number>`max(${schema.pageVisits.visitedAt})`.as("last_visit"),
				lastUrl: sql<string>`max(${schema.pageVisits.url})`.as("last_url"),
				lastTitle: sql<string>`max(${schema.pageVisits.title})`.as("last_title"),
			})
			.from(schema.pageVisits)
			.where(gte(schema.pageVisits.visitedAt, sixtyDaysAgo))
			.groupBy(schema.pageVisits.domain)
			.having(sql`count(*) >= 3 AND max(${schema.pageVisits.visitedAt}) < ${fourteenDaysAgo}`)
			.all();

		return rows
			.filter(r => !BLOCKLIST.has(r.domain))
			.map(r => {
				const daysAgo = Math.floor((Date.now() - r.lastVisit) / 86400000);
				return {
					type: "stale" as const,
					title: `You haven't visited ${r.domain} in ${daysAgo} days`,
					body: `You visited ${r.visitCount} times recently. Worth checking back?`,
					url: r.lastUrl,
					priority: daysAgo > 30 ? 2 : 3,
					sourceAnalyzer: "staleness",
				};
			});
	},
};
