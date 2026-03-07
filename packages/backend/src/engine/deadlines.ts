import type { Analyzer } from "./index.js";
import { sql, gte, lte, eq } from "drizzle-orm";
import { schema } from "../db/client.js";

export const deadlineAnalyzer: Analyzer = {
	name: "deadlines",

	run(db) {
		const now = Date.now();
		const sevenDaysOut = now + 7 * 24 * 60 * 60 * 1000;

		// Find extractions with kind=deadline where the ISO date is within 7 days
		const rows = db
			.select()
			.from(schema.extractions)
			.where(eq(schema.extractions.kind, "deadline"))
			.orderBy(sql`${schema.extractions.extractedAt} DESC`)
			.limit(100)
			.all();

		const results = [];
		for (const row of rows) {
			try {
				const meta = row.metadata ? JSON.parse(row.metadata) : {};
				if (!meta.iso) continue;
				const deadline = new Date(meta.iso).getTime();
				if (deadline < now || deadline > sevenDaysOut) continue;

				const daysUntil = Math.ceil((deadline - now) / 86400000);
				const priority = daysUntil <= 1 ? 5 : daysUntil <= 3 ? 4 : 3;

				results.push({
					type: "deadline" as const,
					title: `Deadline in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
					body: row.context ?? row.value,
					url: row.url,
					priority,
					sourceAnalyzer: "deadlines",
				});
			} catch {
				// skip malformed metadata
			}
		}

		return results;
	},
};
