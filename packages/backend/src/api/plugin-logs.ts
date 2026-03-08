import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, desc } from "drizzle-orm";

const app = new Hono();

// GET /api/plugin-logs?snapshotId=N or ?pluginName=X&limit=N
app.get("/", (c) => {
	const snapshotId = c.req.query("snapshotId");
	const pluginName = c.req.query("pluginName");
	const limit = Number(c.req.query("limit") ?? "50");

	let query = db.select().from(schema.pluginLogs).$dynamic();

	if (snapshotId) {
		query = query.where(
			eq(schema.pluginLogs.snapshotId, Number(snapshotId)),
		);
	} else if (pluginName) {
		query = query.where(eq(schema.pluginLogs.pluginName, pluginName));
	}

	const logs = query
		.orderBy(desc(schema.pluginLogs.createdAt))
		.limit(limit)
		.all();

	return c.json({ logs });
});

export default app;
