import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { ReminderCreateSchema } from "@impact/shared";
import { eq, asc } from "drizzle-orm";

const app = new Hono();

app.get("/", async (c) => {
	const reminders = db
		.select()
		.from(schema.reminders)
		.orderBy(asc(schema.reminders.remindAt))
		.all();
	return c.json({ reminders });
});

app.post("/", async (c) => {
	const body = ReminderCreateSchema.parse(await c.req.json());
	const reminder = db
		.insert(schema.reminders)
		.values({
			url: body.url ?? null,
			title: body.title,
			note: body.note ?? "",
			remindAt: body.remindAt,
			createdAt: Date.now(),
		})
		.returning()
		.get();
	return c.json({ reminder }, 201);
});

app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = await c.req.json();
	const updated = db
		.update(schema.reminders)
		.set(body)
		.where(eq(schema.reminders.id, id))
		.returning()
		.get();
	if (!updated) return c.json({ error: "Not found" }, 404);
	return c.json({ reminder: updated });
});

app.delete("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	db.delete(schema.reminders).where(eq(schema.reminders.id, id)).run();
	return c.json({ ok: true });
});

export default app;
