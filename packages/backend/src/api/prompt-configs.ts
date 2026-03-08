import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { callOllama, callOllamaJson } from "../services/ollama.js";
import { cleanPageText } from "../plugins/llm-extraction.js";

export const DEFAULT_EXTRACTION_PROMPT = `Extract key information from this web page as a JSON object.

URL: {url}
Content:
{pageText}

Return a compact JSON object. Always include a "summary" field (2-3 sentences describing the page). For product pages include: name, price, currency, availability. For articles include: title, author, date, key_points (array). For any other page, include whatever fields best capture the important information.

Return ONLY valid JSON with no markdown, no preamble, no explanation.`;

/** Convert a glob-style pattern (using * as wildcard) to a regex */
export function globToRegex(pattern: string): RegExp {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
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

interface CheerioPluginConfig {
	selector?: string;
	stripTags?: string;
	textOnly?: boolean;
}

/** Sync a prompt config and cheerio config into plugin_configs */
function syncToPluginConfigs(
	urlPattern: string,
	llm: LlmPluginConfig,
	cheerio: CheerioPluginConfig,
	now: number,
): void {
	// 1. Sync LLM Extraction
	const existingLlm = db
		.select()
		.from(schema.pluginConfigs)
		.where(
			and(
				eq(schema.pluginConfigs.pluginName, "llm-extraction"),
				eq(schema.pluginConfigs.urlPattern, urlPattern),
			),
		)
		.get();
	const llmJson = JSON.stringify(llm);
	if (existingLlm) {
		db.update(schema.pluginConfigs)
			.set({ config: llmJson, updatedAt: now })
			.where(eq(schema.pluginConfigs.id, existingLlm.id))
			.run();
	} else {
		db.insert(schema.pluginConfigs)
			.values({
				pluginName: "llm-extraction",
				urlPattern,
				enabled: true,
				config: llmJson,
				priority: 0,
				createdAt: now,
				updatedAt: now,
			})
			.run();
	}

	// 2. Sync Cheerio Preprocessor
	const existingCheerio = db
		.select()
		.from(schema.pluginConfigs)
		.where(
			and(
				eq(schema.pluginConfigs.pluginName, "cheerio-preprocessor"),
				eq(schema.pluginConfigs.urlPattern, urlPattern),
			),
		)
		.get();
	const cheerioJson = JSON.stringify(cheerio);
	if (existingCheerio) {
		db.update(schema.pluginConfigs)
			.set({ config: cheerioJson, updatedAt: now })
			.where(eq(schema.pluginConfigs.id, existingCheerio.id))
			.run();
	} else {
		db.insert(schema.pluginConfigs)
			.values({
				pluginName: "cheerio-preprocessor",
				urlPattern,
				enabled: true,
				config: cheerioJson,
				priority: 0,
				createdAt: now,
				updatedAt: now,
			})
			.run();
	}
}

/** Load all extras for a set of url patterns */
function loadPluginExtras(
	urlPatterns: string[],
): Map<string, { llm: LlmPluginConfig; cheerio: CheerioPluginConfig }> {
	const map = new Map<
		string,
		{ llm: LlmPluginConfig; cheerio: CheerioPluginConfig }
	>();
	if (urlPatterns.length === 0) return map;

	const rows = db
		.select()
		.from(schema.pluginConfigs)
		.where(
			sql`${schema.pluginConfigs.urlPattern} IN (${sql.join(urlPatterns.map((p) => sql`${p}`), sql`, `)})`,
		)
		.all();

	for (const row of rows) {
		if (!map.has(row.urlPattern))
			map.set(row.urlPattern, { llm: { prompt: "" }, cheerio: {} });
		const entry = map.get(row.urlPattern)!;
		if (row.pluginName === "llm-extraction")
			entry.llm = JSON.parse(row.config || "{}");
		if (row.pluginName === "cheerio-preprocessor")
			entry.cheerio = JSON.parse(row.config || "{}");
	}
	return map;
}

/** Remove both plugin entries when a prompt config is deleted */
function removeFromPluginConfigs(urlPattern: string): void {
	db.delete(schema.pluginConfigs)
		.where(eq(schema.pluginConfigs.urlPattern, urlPattern))
		.run();
}

const app = new Hono();

// POST /api/prompt-configs/suggest — generate a suggested prompt and cheerio settings for a URL
app.post("/suggest", async (c) => {
	const { url } = (await c.req.json()) as { url: string };
	if (!url) return c.json({ error: "url required" }, 400);

	const snap = db
		.select()
		.from(schema.pageSnapshots)
		.where(eq(schema.pageSnapshots.url, url))
		.orderBy(desc(schema.pageSnapshots.capturedAt))
		.get();

	if (!snap || !snap.pageText) {
		return c.json(
			{ error: "No snapshot found for this URL. Visit the page first." },
			404,
		);
	}

	const context = cleanPageText(snap.pageText, 8000);
	const metaPrompt = `You are an expert at web scraping and data extraction.
Analyze this page content and URL (${url}) and suggest:
1. A concise extraction prompt for an LLM to pull key data as JSON.
2. Optimized Cheerio preprocessing settings to reduce noise.

CONTENT:
${context}

Return ONLY a JSON object with this exact structure:
{
  "prompt": "...", 
  "cheerio": {
    "selector": ".main-content", // CSS selector for the main data area
    "stripTags": "nav, footer, .ads", // Comma-separated tags/classes to remove
    "textOnly": false // true if text is enough, false if HTML structure helps
  }
}

Use placeholders {url} and {pageText} in the prompt.`;

	try {
		const result = await callOllamaJson(metaPrompt);
		return c.json(result);
	} catch (e) {
		return c.json(
			{ error: "Failed to generate suggestion", detail: String(e) },
			500,
		);
	}
});

// GET /api/prompt-configs — list all, merged with plugin_configs extras
app.get("/", (c) => {
	const configs = db
		.select()
		.from(schema.promptConfigs)
		.orderBy(desc(schema.promptConfigs.updatedAt))
		.all();
	const extras = loadPluginExtras(configs.map((c) => c.urlPattern));
	const merged = configs.map((c) => {
		const ex = extras.get(c.urlPattern) ?? {
			llm: {} as LlmPluginConfig,
			cheerio: {},
		};
		return {
			...c,
			slidingWindow: ex.llm.slidingWindow ?? false,
			chunkSize: ex.llm.chunkSize ?? null,
			debug: ex.llm.debug ?? false,
			cheerio: ex.cheerio,
		};
	});
	return c.json({ configs: merged, defaultPrompt: DEFAULT_EXTRACTION_PROMPT });
});

// POST /api/prompt-configs — create
app.post("/", async (c) => {
	const body = (await c.req.json()) as {
		urlPattern: string;
		prompt: string;
		slidingWindow?: boolean;
		chunkSize?: number;
		debug?: boolean;
		cheerio?: CheerioPluginConfig;
	};
	if (!body.urlPattern?.trim() || !body.prompt?.trim()) {
		return c.json({ error: "urlPattern and prompt are required" }, 400);
	}
	const now = Date.now();
	const cfg = db
		.insert(schema.promptConfigs)
		.values({
			urlPattern: body.urlPattern.trim(),
			prompt: body.prompt.trim(),
			createdAt: now,
			updatedAt: now,
		})
		.returning()
		.get();

	const llmCfg: LlmPluginConfig = { prompt: cfg.prompt };
	if (body.slidingWindow) llmCfg.slidingWindow = true;
	if (body.chunkSize) llmCfg.chunkSize = body.chunkSize;
	if (body.debug) llmCfg.debug = true;

	const cheerioCfg: CheerioPluginConfig = body.cheerio ?? {};

	syncToPluginConfigs(cfg.urlPattern, llmCfg, cheerioCfg, now);
	return c.json(
		{
			...cfg,
			slidingWindow: llmCfg.slidingWindow ?? false,
			chunkSize: llmCfg.chunkSize ?? null,
			debug: llmCfg.debug ?? false,
			cheerio: cheerioCfg,
		},
		201,
	);
});

// PATCH /api/prompt-configs/:id — update
app.patch("/:id", async (c) => {
	const id = Number(c.req.param("id"));
	const body = (await c.req.json()) as {
		urlPattern?: string;
		prompt?: string;
		slidingWindow?: boolean;
		chunkSize?: number | null;
		debug?: boolean;
		cheerio?: CheerioPluginConfig;
	};

	const before = db
		.select()
		.from(schema.promptConfigs)
		.where(eq(schema.promptConfigs.id, id))
		.get();
	if (!before) return c.json({ error: "Not found" }, 404);

	const now = Date.now();
	const update: Partial<typeof schema.promptConfigs.$inferInsert> = {
		updatedAt: now,
	};
	if (body.urlPattern !== undefined) update.urlPattern = body.urlPattern.trim();
	if (body.prompt !== undefined) update.prompt = body.prompt.trim();

	const cfg = db
		.update(schema.promptConfigs)
		.set(update)
		.where(eq(schema.promptConfigs.id, id))
		.returning()
		.get();
	if (!cfg) return c.json({ error: "Not found" }, 404);

	const oldPattern = before.urlPattern;
	const newPattern = cfg.urlPattern;

	const extras = loadPluginExtras([oldPattern]).get(oldPattern) ?? {
		llm: { prompt: cfg.prompt },
		cheerio: {},
	};

	const llmCfg: LlmPluginConfig = { ...extras.llm, prompt: cfg.prompt };
	if (body.slidingWindow !== undefined) {
		if (body.slidingWindow) llmCfg.slidingWindow = true;
		else delete llmCfg.slidingWindow;
	}
	if (body.chunkSize !== undefined) {
		if (body.chunkSize) llmCfg.chunkSize = body.chunkSize;
		else delete llmCfg.chunkSize;
	}
	if (body.debug !== undefined) {
		if (body.debug) llmCfg.debug = true;
		else delete llmCfg.debug;
	}

	const cheerioCfg: CheerioPluginConfig = { ...extras.cheerio, ...body.cheerio };

	if (newPattern !== oldPattern) {
		removeFromPluginConfigs(oldPattern);
	}
	syncToPluginConfigs(newPattern, llmCfg, cheerioCfg, now);

	return c.json({
		...cfg,
		slidingWindow: llmCfg.slidingWindow ?? false,
		chunkSize: llmCfg.chunkSize ?? null,
		debug: llmCfg.debug ?? false,
		cheerio: cheerioCfg,
	});
});

// DELETE /api/prompt-configs/:id
app.delete("/:id", (c) => {
	const id = Number(c.req.param("id"));
	const cfg = db
		.select()
		.from(schema.promptConfigs)
		.where(eq(schema.promptConfigs.id, id))
		.get();
	if (cfg) removeFromPluginConfigs(cfg.urlPattern);
	db.delete(schema.promptConfigs).where(eq(schema.promptConfigs.id, id)).run();
	return c.json({ ok: true });
});

export default app;
