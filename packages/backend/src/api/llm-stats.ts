import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { desc, gte, sql } from "drizzle-orm";

const app = new Hono();

// GET /api/llm-stats/summary — aggregate stats grouped by model+operation
app.get("/summary", async (c) => {
	const since = Number(c.req.query("since") ?? 0);
	const rows = db.select({
		model: schema.llmStats.model,
		operation: schema.llmStats.operation,
		calls: sql<number>`count(*)`,
		successCalls: sql<number>`sum(${schema.llmStats.success})`,
		avgWallMs: sql<number>`avg(${schema.llmStats.wallDurationMs})`,
		avgEvalMs: sql<number>`avg(${schema.llmStats.evalDurationMs})`,
		totalPromptTokens: sql<number>`sum(${schema.llmStats.promptTokens})`,
		totalCompletionTokens: sql<number>`sum(${schema.llmStats.completionTokens})`,
		avgCompletionTokens: sql<number>`avg(${schema.llmStats.completionTokens})`,
		avgPromptChars: sql<number>`avg(${schema.llmStats.promptChars})`,
	})
		.from(schema.llmStats)
		.where(since ? gte(schema.llmStats.createdAt, since) : sql`1=1`)
		.groupBy(schema.llmStats.model, schema.llmStats.operation)
		.all();

	// Also get totals
	const totals = db.select({
		totalCalls: sql<number>`count(*)`,
		totalSuccess: sql<number>`sum(${schema.llmStats.success})`,
		totalPromptTokens: sql<number>`sum(${schema.llmStats.promptTokens})`,
		totalCompletionTokens: sql<number>`sum(${schema.llmStats.completionTokens})`,
		avgWallMs: sql<number>`avg(${schema.llmStats.wallDurationMs})`,
	})
		.from(schema.llmStats)
		.where(since ? gte(schema.llmStats.createdAt, since) : sql`1=1`)
		.get();

	return c.json({ summary: rows, totals });
});

// GET /api/llm-stats/recent?limit=50 — most recent individual calls
app.get("/recent", async (c) => {
	const limit = Math.min(Number(c.req.query("limit") ?? "50"), 200);
	const rows = db.select()
		.from(schema.llmStats)
		.orderBy(desc(schema.llmStats.createdAt))
		.limit(limit)
		.all();
	return c.json({ calls: rows });
});

// DELETE /api/llm-stats — clear all stats
app.delete("/", async (c) => {
	db.delete(schema.llmStats).run();
	return c.json({ ok: true });
});

export default app;
