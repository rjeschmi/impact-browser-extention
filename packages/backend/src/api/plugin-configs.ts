import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, desc } from "drizzle-orm";

const app = new Hono();

// GET /api/plugin-configs — list all
app.get("/", (c) => {
	const configs = db
		.select()
		.from(schema.pluginConfigs)
		.orderBy(desc(schema.pluginConfigs.updatedAt))
		.all();
	return c.json({ configs });
});

// POST /api/plugin-configs — create
app.post("/", async (c) => {
	const body = (await c.req.json()) as {
		pluginName: string;
		urlPattern: string;
		enabled?: boolean;
		config?: Record<string, unknown>;
		priority?: number;
	};
	if (!body.pluginName?.trim() || !body.urlPattern?.trim()) {
		return c.json({ error: "pluginName and urlPattern are required" }, 400);
	}
	const now = Date.now();
	const cfg = db
		.insert(schema.pluginConfigs)
		.values({
			pluginName: body.pluginName.trim(),
			urlPattern: body.urlPattern.trim(),
			enabled: body.enabled ?? true,
			config: body.config ? JSON.stringify(body.config) : null,
			priority: body.priority ?? 0,
			createdAt: now,
			updatedAt: now,
		})
		.returning()
		.get();
	return c.json(cfg, 201);
});

// PATCH /api/plugin-configs/:id — update
app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = (await c.req.json()) as {
		pluginName?: string;
		urlPattern?: string;
		enabled?: boolean;
		config?: Record<string, unknown>;
		priority?: number;
	};
	const update: Partial<typeof schema.pluginConfigs.$inferInsert> = {
		updatedAt: Date.now(),
	};
	if (body.pluginName !== undefined)
		update.pluginName = body.pluginName.trim();
	if (body.urlPattern !== undefined)
		update.urlPattern = body.urlPattern.trim();
	if (body.enabled !== undefined) update.enabled = body.enabled;
	if (body.config !== undefined)
		update.config = JSON.stringify(body.config);
	if (body.priority !== undefined) update.priority = body.priority;

	const cfg = db
		.update(schema.pluginConfigs)
		.set(update)
		.where(eq(schema.pluginConfigs.id, id))
		.returning()
		.get();
	if (!cfg) return c.json({ error: "Not found" }, 404);
	return c.json(cfg);
});

// DELETE /api/plugin-configs/:id
app.delete("/:id", (c) => {
	const id = Number(c.req.param("id"));
	db.delete(schema.pluginConfigs)
		.where(eq(schema.pluginConfigs.id, id))
		.run();
	return c.json({ ok: true });
});

export default app;
