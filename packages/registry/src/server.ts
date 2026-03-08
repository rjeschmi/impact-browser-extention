import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { db, schema } from "./db/client.js";
import { sql } from "drizzle-orm";
import entries from "./api/entries.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: "*" }));

app.get("/api/health", (c) => {
	const count = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.registryEntries)
		.get();
	return c.json({ status: "ok", version: "0.1.0", entries: count?.count ?? 0 });
});

app.route("/api/entries", entries);

export default app;
