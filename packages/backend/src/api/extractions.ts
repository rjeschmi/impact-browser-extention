import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { ExtractionSchema } from "@impact/shared";
import { z } from "zod";
import { eq, gte, and, desc } from "drizzle-orm";

const app = new Hono();

app.post("/", async (c) => {
	const body = await c.req.json();
	const extractions = z.array(ExtractionSchema).parse(Array.isArray(body) ? body : [body]);

	const inserted = [];
	for (const e of extractions) {
		const result = db
			.insert(schema.extractions)
			.values({
				visitId: e.visitId ?? null,
				url: e.url,
				kind: e.kind,
				value: e.value,
				context: e.context ?? null,
				metadata: e.metadata ?? null,
				extractedAt: e.extractedAt,
			})
			.returning()
			.get();
		inserted.push(result);
	}

	return c.json({ inserted: inserted.length }, 201);
});

app.get("/", async (c) => {
	const kind = c.req.query("kind");
	const url = c.req.query("url");
	const since = c.req.query("since");
	const limit = Math.min(Number(c.req.query("limit") || 100), 500);

	const conditions = [];
	if (kind) conditions.push(eq(schema.extractions.kind, kind));
	if (url) conditions.push(eq(schema.extractions.url, url));
	if (since) conditions.push(gte(schema.extractions.extractedAt, Number(since)));

	const query = db.select().from(schema.extractions);
	const extractions = (conditions.length > 0
		? query.where(and(...conditions))
		: query
	)
		.orderBy(desc(schema.extractions.extractedAt))
		.limit(limit)
		.all();

	return c.json({ extractions, count: extractions.length });
});

export default app;
