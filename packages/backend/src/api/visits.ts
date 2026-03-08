import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { PageVisitBatchSchema, PageVisitSchema } from "@impact/shared";
import { desc, eq, gte, sql, and, notInArray } from "drizzle-orm";

const app = new Hono();

app.post("/", async (c) => {
	const body = await c.req.json();

	// Accept single visit or array
	const visits = Array.isArray(body)
		? PageVisitBatchSchema.parse(body)
		: [PageVisitSchema.parse(body)];

	const inserted = [];
	for (const visit of visits) {
		const result = db
			.insert(schema.pageVisits)
			.values({
				url: visit.url,
				domain: visit.domain,
				title: visit.title,
				visitedAt: visit.visitedAt,
				durationMs: visit.durationMs,
				referrerUrl: visit.referrerUrl ?? null,
			})
			.returning()
			.get();
		inserted.push(result);
	}

	return c.json({ inserted: inserted.length, visits: inserted }, 201);
});

app.get("/", async (c) => {
	const domain = c.req.query("domain");
	const since = c.req.query("since");
	const limit = Math.min(Number(c.req.query("limit") || 100), 500);
	const offset = Number(c.req.query("offset") || 0);

	let query = db.select().from(schema.pageVisits);

	const conditions = [];
	if (domain) conditions.push(eq(schema.pageVisits.domain, domain));
	if (since)
		conditions.push(gte(schema.pageVisits.visitedAt, Number(since)));

	if (conditions.length > 0) {
		query = query.where(
			conditions.length === 1
				? conditions[0]
				: sql`${conditions[0]} AND ${conditions[1]}`,
		) as typeof query;
	}

	const visits = query
		.orderBy(desc(schema.pageVisits.visitedAt))
		.limit(limit)
		.offset(offset)
		.all();

	return c.json({ visits, count: visits.length });
});

app.get("/domain-summary", async (c) => {
	const domain = c.req.query("domain");
	if (!domain) return c.json({ error: "domain required" }, 400);

	const visitCount = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.pageVisits)
		.where(eq(schema.pageVisits.domain, domain))
		.get();

	const extractionCount = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.extractions)
		.where(sql`${schema.extractions.url} LIKE ${"%" + domain + "%"}`)
		.get();

	return c.json({
		domain,
		visits: visitCount?.count ?? 0,
		extractions: extractionCount?.count ?? 0,
	});
});

// Domains that should never appear in stats
const STATS_BLOCKLIST = ["localhost", "127.0.0.1", ""];

app.get("/stats", async (c) => {
	const since = c.req.query("since");
	const sinceTs = since
		? Number(since)
		: Date.now() - 7 * 24 * 60 * 60 * 1000;

	const baseWhere = and(
		gte(schema.pageVisits.visitedAt, sinceTs),
		notInArray(schema.pageVisits.domain, STATS_BLOCKLIST),
	);

	const topDomains = db
		.select({
			domain: schema.pageVisits.domain,
			visitCount: sql<number>`count(*)`.as("visit_count"),
			totalDuration: sql<number>`sum(${schema.pageVisits.durationMs})`.as(
				"total_duration",
			),
		})
		.from(schema.pageVisits)
		.where(baseWhere)
		.groupBy(schema.pageVisits.domain)
		.orderBy(sql`visit_count DESC`)
		.limit(20)
		.all();

	const totalVisits = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.pageVisits)
		.where(baseWhere)
		.get();

	return c.json({
		topDomains,
		totalVisits: totalVisits?.count ?? 0,
		since: sinceTs,
	});
});

export default app;
