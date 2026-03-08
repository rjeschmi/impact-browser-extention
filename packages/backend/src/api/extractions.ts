import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { ExtractionSchema } from "@impact/shared";
import { z } from "zod";
import { eq, gte, and, desc, like } from "drizzle-orm";

const PinUpdateSchema = z.object({ isPinned: z.boolean() });

const app = new Hono();

app.post("/", async (c) => {
	const body = await c.req.json();
	const extractions = z.array(ExtractionSchema).parse(Array.isArray(body) ? body : [body]);

	// Dedup windows per kind:
	// - keyword/todo/deadline: never store the same value again for the same URL
	// - price: re-store only if the value changed (enables price change detection)
	//   but dedupe same-value within 24h to avoid rapid re-visits inflating the table
	const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
	const PERMANENT_DEDUP = new Set(["keyword", "todo", "deadline"]);

	const inserted = [];
	for (const e of extractions) {
		const conditions = [
			eq(schema.extractions.url, e.url),
			eq(schema.extractions.kind, e.kind),
			eq(schema.extractions.value, e.value),
		];

		if (!PERMANENT_DEDUP.has(e.kind)) {
			// For prices: only dedupe same value within 24h
			conditions.push(gte(schema.extractions.extractedAt, oneDayAgo));
		}

		const exists = db
			.select({ id: schema.extractions.id })
			.from(schema.extractions)
			.where(and(...conditions))
			.get();
		if (exists) continue;

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
	const domain = c.req.query("domain");
	const since = c.req.query("since");
	const limit = Math.min(Number(c.req.query("limit") || 100), 500);

	const conditions = [];
	if (kind) conditions.push(eq(schema.extractions.kind, kind));
	if (url) conditions.push(eq(schema.extractions.url, url));
	if (domain) conditions.push(like(schema.extractions.url, `%://${domain}/%`));
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

app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = await c.req.json();
	const { isPinned } = PinUpdateSchema.parse(body);

	const updated = db
		.update(schema.extractions)
		.set({ isPinned })
		.where(eq(schema.extractions.id, id))
		.returning()
		.get();

	if (!updated) return c.json({ error: "Not found" }, 404);
	return c.json(updated);
});

export default app;
