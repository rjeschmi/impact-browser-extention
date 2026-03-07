import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { SuggestionUpdateSchema } from "@impact/shared";
import { eq, and, desc } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
	const status = c.req.query("status") ?? "active";
	const type = c.req.query("type");

	const conditions = [eq(schema.suggestions.status, status)];
	if (type) conditions.push(eq(schema.suggestions.type, type));

	const suggestions = db
		.select()
		.from(schema.suggestions)
		.where(and(...conditions))
		.orderBy(desc(schema.suggestions.priority), desc(schema.suggestions.createdAt))
		.all();

	return c.json({ suggestions });
});

app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = SuggestionUpdateSchema.parse(await c.req.json());

	const updated = db
		.update(schema.suggestions)
		.set({
			...(body.status ? { status: body.status } : {}),
			...(body.snoozedUntil !== undefined ? { snoozedUntil: body.snoozedUntil } : {}),
		})
		.where(eq(schema.suggestions.id, id))
		.returning()
		.get();

	if (!updated) return c.json({ error: "Not found" }, 404);
	return c.json({ suggestion: updated });
});

export default app;
