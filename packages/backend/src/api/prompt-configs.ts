import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, desc, and } from "drizzle-orm";

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

interface LlmPluginConfig {
	prompt: string;
	slidingWindow?: boolean;
	chunkSize?: number;
	debug?: boolean;
}

/** Sync a prompt config into plugin_configs so the llm-extraction pipeline picks it up */
function syncToPluginConfigs(urlPattern: string, cfg: LlmPluginConfig, now: number): void {
	const existing = db.select().from(schema.pluginConfigs)
		.where(and(eq(schema.pluginConfigs.pluginName, "llm-extraction"), eq(schema.pluginConfigs.urlPattern, urlPattern)))
		.get();
	const configJson = JSON.stringify(cfg);
	if (existing) {
		db.update(schema.pluginConfigs)
			.set({ config: configJson, updatedAt: now })
			.where(eq(schema.pluginConfigs.id, existing.id))
			.run();
	} else {
		db.insert(schema.pluginConfigs)
			.values({ pluginName: "llm-extraction", urlPattern, enabled: true, config: configJson, priority: 0, createdAt: now, updatedAt: now })
			.run();
	}
}

/** Load llm-extraction plugin config fields for a set of url patterns */
function loadPluginExtras(urlPatterns: string[]): Map<string, LlmPluginConfig> {
	if (urlPatterns.length === 0) return new Map();
	const rows = db.select().from(schema.pluginConfigs)
		.where(eq(schema.pluginConfigs.pluginName, "llm-extraction"))
		.all();
	const map = new Map<string, LlmPluginConfig>();
	for (const row of rows) {
		if (urlPatterns.includes(row.urlPattern) && row.config) {
			map.set(row.urlPattern, JSON.parse(row.config) as LlmPluginConfig);
		}
	}
	return map;
}

/** Remove the corresponding plugin_config entry when a prompt config is deleted */
function removeFromPluginConfigs(urlPattern: string): void {
	db.delete(schema.pluginConfigs)
		.where(and(eq(schema.pluginConfigs.pluginName, "llm-extraction"), eq(schema.pluginConfigs.urlPattern, urlPattern)))
		.run();
}

const app = new Hono();

// GET /api/prompt-configs — list all, merged with plugin_configs extras
app.get("/", (c) => {
	const configs = db.select().from(schema.promptConfigs).orderBy(desc(schema.promptConfigs.updatedAt)).all();
	const extras = loadPluginExtras(configs.map(c => c.urlPattern));
	const merged = configs.map(c => {
		const ex = extras.get(c.urlPattern) ?? {};
		return { ...c, slidingWindow: ex.slidingWindow ?? false, chunkSize: ex.chunkSize ?? null, debug: ex.debug ?? false };
	});
	return c.json({ configs: merged, defaultPrompt: DEFAULT_EXTRACTION_PROMPT });
});

// POST /api/prompt-configs — create
app.post("/", async (c) => {
	const body = await c.req.json() as { urlPattern: string; prompt: string; slidingWindow?: boolean; chunkSize?: number; debug?: boolean };
	if (!body.urlPattern?.trim() || !body.prompt?.trim()) {
		return c.json({ error: "urlPattern and prompt are required" }, 400);
	}
	const now = Date.now();
	const cfg = db.insert(schema.promptConfigs)
		.values({ urlPattern: body.urlPattern.trim(), prompt: body.prompt.trim(), createdAt: now, updatedAt: now })
		.returning().get();
	const pluginCfg: LlmPluginConfig = { prompt: cfg.prompt };
	if (body.slidingWindow) pluginCfg.slidingWindow = true;
	if (body.chunkSize) pluginCfg.chunkSize = body.chunkSize;
	if (body.debug) pluginCfg.debug = true;
	syncToPluginConfigs(cfg.urlPattern, pluginCfg, now);
	return c.json({ ...cfg, slidingWindow: pluginCfg.slidingWindow ?? false, chunkSize: pluginCfg.chunkSize ?? null, debug: pluginCfg.debug ?? false }, 201);
});

// PATCH /api/prompt-configs/:id — update
app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = await c.req.json() as { urlPattern?: string; prompt?: string; slidingWindow?: boolean; chunkSize?: number | null; debug?: boolean };

	const before = db.select().from(schema.promptConfigs).where(eq(schema.promptConfigs.id, id)).get();
	if (!before) return c.json({ error: "Not found" }, 404);

	const now = Date.now();
	const update: Partial<typeof schema.promptConfigs.$inferInsert> = { updatedAt: now };
	if (body.urlPattern !== undefined) update.urlPattern = body.urlPattern.trim();
	if (body.prompt !== undefined) update.prompt = body.prompt.trim();

	const cfg = db.update(schema.promptConfigs).set(update).where(eq(schema.promptConfigs.id, id)).returning().get();
	if (!cfg) return c.json({ error: "Not found" }, 404);

	if (body.urlPattern !== undefined && body.urlPattern.trim() !== before.urlPattern) {
		removeFromPluginConfigs(before.urlPattern);
	}

	// Preserve existing plugin extras, apply changes
	const existingExtras = loadPluginExtras([cfg.urlPattern]).get(cfg.urlPattern) ?? { prompt: cfg.prompt };
	const pluginCfg: LlmPluginConfig = { ...existingExtras, prompt: cfg.prompt };
	if (body.slidingWindow !== undefined) {
		if (body.slidingWindow) pluginCfg.slidingWindow = true;
		else delete pluginCfg.slidingWindow;
	}
	if (body.chunkSize !== undefined) {
		if (body.chunkSize) pluginCfg.chunkSize = body.chunkSize;
		else delete pluginCfg.chunkSize;
	}
	if (body.debug !== undefined) {
		if (body.debug) pluginCfg.debug = true;
		else delete pluginCfg.debug;
	}
	syncToPluginConfigs(cfg.urlPattern, pluginCfg, now);
	return c.json({ ...cfg, slidingWindow: pluginCfg.slidingWindow ?? false, chunkSize: pluginCfg.chunkSize ?? null, debug: pluginCfg.debug ?? false });
});

// DELETE /api/prompt-configs/:id
app.delete("/:id", (c) => {
	const id = Number(c.req.param("id"));
	const cfg = db.select().from(schema.promptConfigs).where(eq(schema.promptConfigs.id, id)).get();
	if (cfg) removeFromPluginConfigs(cfg.urlPattern);
	db.delete(schema.promptConfigs).where(eq(schema.promptConfigs.id, id)).run();
	return c.json({ ok: true });
});

export default app;
