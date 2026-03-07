import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { getBlocklist, addToBlocklist, removeFromBlocklist } from "../services/blocklist.js";
import { lt, sql } from "drizzle-orm";
import { z } from "zod";

const app = new Hono();

// --- Blocklist ---
app.get("/blocklist", (c) => {
	return c.json({ blocklist: getBlocklist() });
});

app.post("/blocklist", async (c) => {
	const { domain } = z.object({ domain: z.string().min(1) }).parse(await c.req.json());
	return c.json({ blocklist: addToBlocklist(domain) });
});

app.delete("/blocklist/:domain", (c) => {
	const domain = decodeURIComponent(c.req.param("domain"));
	return c.json({ blocklist: removeFromBlocklist(domain) });
});

// --- Stats ---
app.get("/stats", (c) => {
	const visitCount = db.select({ count: sql<number>`count(*)` }).from(schema.pageVisits).get();
	const extractionCount = db.select({ count: sql<number>`count(*)` }).from(schema.extractions).get();
	const suggestionCount = db.select({ count: sql<number>`count(*)` }).from(schema.suggestions).get();
	const reminderCount = db.select({ count: sql<number>`count(*)` }).from(schema.reminders).get();

	return c.json({
		visits: visitCount?.count ?? 0,
		extractions: extractionCount?.count ?? 0,
		suggestions: suggestionCount?.count ?? 0,
		reminders: reminderCount?.count ?? 0,
		llmEnabled: process.env.IMPACT_LLM === "1",
		ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
	});
});

// --- Data export ---
app.get("/export", (c) => {
	const visits = db.select().from(schema.pageVisits).all();
	const extractions = db.select().from(schema.extractions).all();
	const suggestions = db.select().from(schema.suggestions).all();
	const reminders = db.select().from(schema.reminders).all();

	c.header("Content-Disposition", `attachment; filename="impact-export-${Date.now()}.json"`);
	return c.json({ exportedAt: Date.now(), visits, extractions, suggestions, reminders });
});

// --- Purge old data ---
app.delete("/purge", async (c) => {
	const { olderThanDays } = z.object({ olderThanDays: z.number().int().min(1).max(365) })
		.parse(await c.req.json());

	const cutoff = Date.now() - olderThanDays * 86400000;

	const deletedVisits = db.delete(schema.pageVisits)
		.where(lt(schema.pageVisits.visitedAt, cutoff))
		.returning({ id: schema.pageVisits.id })
		.all();

	const deletedExtractions = db.delete(schema.extractions)
		.where(lt(schema.extractions.extractedAt, cutoff))
		.returning({ id: schema.extractions.id })
		.all();

	return c.json({
		deleted: { visits: deletedVisits.length, extractions: deletedExtractions.length },
		cutoff,
	});
});

export default app;
