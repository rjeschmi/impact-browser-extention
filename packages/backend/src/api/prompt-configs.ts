import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, desc } from "drizzle-orm";

export const DEFAULT_EXTRACTION_PROMPT = `Extract key information from this web page as a JSON object.

URL: {url}
Content:
{pageText}

Return a compact JSON object. Always include a "summary" field (2-3 sentences describing the page). For product pages include: name, price, currency, availability. For articles include: title, author, date, key_points (array). For any other page, include whatever fields best capture the important information.

Return ONLY valid JSON with no markdown, no preamble, no explanation.`;

/** Convert a glob-style pattern (using * as wildcard) to a regex */
export function globToRegex(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`);
}

/** Find the most specific matching prompt for a URL, or null for default */
export function findPromptForUrl(url: string): string | null {
	const configs = db.select().from(schema.promptConfigs).all();
	if (configs.length === 0) return null;
	// Sort longest pattern first (most specific)
	configs.sort((a, b) => b.urlPattern.length - a.urlPattern.length);
	for (const cfg of configs) {
		if (globToRegex(cfg.urlPattern).test(url)) return cfg.prompt;
	}
	return null;
}

const app = new Hono();

// GET /api/prompt-configs — list all
app.get("/", (c) => {
	const configs = db.select().from(schema.promptConfigs).orderBy(desc(schema.promptConfigs.updatedAt)).all();
	return c.json({ configs, defaultPrompt: DEFAULT_EXTRACTION_PROMPT });
});

// POST /api/prompt-configs — create
app.post("/", async (c) => {
	const body = await c.req.json() as { urlPattern: string; prompt: string };
	if (!body.urlPattern?.trim() || !body.prompt?.trim()) {
		return c.json({ error: "urlPattern and prompt are required" }, 400);
	}
	const now = Date.now();
	const cfg = db.insert(schema.promptConfigs)
		.values({ urlPattern: body.urlPattern.trim(), prompt: body.prompt.trim(), createdAt: now, updatedAt: now })
		.returning().get();
	return c.json(cfg, 201);
});

// PATCH /api/prompt-configs/:id — update
app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = await c.req.json() as { urlPattern?: string; prompt?: string };
	const update: Partial<typeof schema.promptConfigs.$inferInsert> = { updatedAt: Date.now() };
	if (body.urlPattern !== undefined) update.urlPattern = body.urlPattern.trim();
	if (body.prompt !== undefined) update.prompt = body.prompt.trim();
	const cfg = db.update(schema.promptConfigs).set(update).where(eq(schema.promptConfigs.id, id)).returning().get();
	if (!cfg) return c.json({ error: "Not found" }, 404);
	return c.json(cfg);
});

// DELETE /api/prompt-configs/:id
app.delete("/:id", (c) => {
	const id = Number(c.req.param("id"));
	db.delete(schema.promptConfigs).where(eq(schema.promptConfigs.id, id)).run();
	return c.json({ ok: true });
});

export default app;
