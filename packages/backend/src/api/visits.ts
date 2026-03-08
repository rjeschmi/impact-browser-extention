import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { PageVisitBatchSchema, PageVisitSchema } from "@impact/shared";
import { desc, eq, gte, isNull, isNotNull, sql, and, notInArray } from "drizzle-orm";
import { generateEmbedding, isLLMEnabled } from "../services/ollama.js";

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
				pageText: visit.pageText ?? null,
			})
			.returning()
			.get();
		inserted.push(result);

		// Fire-and-forget embedding generation
		if (isLLMEnabled() && visit.pageText) {
			const id = result.id;
			const text = visit.pageText;
			generateEmbedding(text)
				.then(vec => {
					db.update(schema.pageVisits)
						.set({ embedding: JSON.stringify(vec) })
						.where(eq(schema.pageVisits.id, id))
						.run();
				})
				.catch(err => console.error("[visits] embedding failed:", err));
		}
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

// Backfill embeddings for visits that have page_text but no embedding
app.post("/reindex", async (c) => {
	if (!isLLMEnabled()) return c.json({ error: "LLM not enabled" }, 400);

	const rows = db.select({ id: schema.pageVisits.id, pageText: schema.pageVisits.pageText })
		.from(schema.pageVisits)
		.where(and(isNotNull(schema.pageVisits.pageText), isNull(schema.pageVisits.embedding)))
		.limit(200)
		.all();

	let done = 0;
	for (const row of rows) {
		try {
			const vec = await generateEmbedding(row.pageText!);
			db.update(schema.pageVisits)
				.set({ embedding: JSON.stringify(vec) })
				.where(eq(schema.pageVisits.id, row.id))
				.run();
			done++;
		} catch (err) {
			console.error("[reindex] embedding failed for visit", row.id, err);
		}
	}

	return c.json({ reindexed: done, remaining: rows.length - done });
});

// Semantic search over visits using cosine similarity
app.get("/search", async (c) => {
	if (!isLLMEnabled()) return c.json({ error: "LLM not enabled" }, 400);

	const q = c.req.query("q");
	if (!q) return c.json({ error: "q required" }, 400);
	const limit = Math.min(Number(c.req.query("limit") || 10), 50);

	const queryVec = await generateEmbedding(q);

	const rows = db.select({
		id: schema.pageVisits.id,
		url: schema.pageVisits.url,
		domain: schema.pageVisits.domain,
		title: schema.pageVisits.title,
		visitedAt: schema.pageVisits.visitedAt,
		durationMs: schema.pageVisits.durationMs,
		embedding: schema.pageVisits.embedding,
	})
		.from(schema.pageVisits)
		.where(isNotNull(schema.pageVisits.embedding))
		.all();

	function cosine(a: number[], b: number[]): number {
		let dot = 0, na = 0, nb = 0;
		for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
		return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
	}

	const scored = rows
		.map(r => ({ ...r, score: cosine(queryVec, JSON.parse(r.embedding!) as number[]) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ embedding: _e, ...r }) => r);

	return c.json({ results: scored, query: q });
});

export default app;
