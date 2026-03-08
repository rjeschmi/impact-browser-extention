import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, and, desc, like, not, isNotNull, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { isLLMEnabled, callOllama, callOllamaJson, generateEmbedding } from "../services/ollama.js";
import { findPromptForUrl, DEFAULT_EXTRACTION_PROMPT } from "./prompt-configs.js";

const app = new Hono();

const SnapshotSubmitSchema = z.object({
	url: z.string().url(),
	domain: z.string(),
	data: z.record(z.unknown()),
	pageText: z.string().optional(),
});

function generateVersion(url: string): string {
	const today = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
	const todayCount = db
		.select({ count: sql<number>`count(*)` })
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), like(schema.pageSnapshots.version, `${today}.%`)))
		.get();
	const seq = String((todayCount?.count ?? 0) + 1).padStart(2, "0");
	return `${today}.${seq}`;
}

function dataChanged(committedData: string, newData: Record<string, unknown>): boolean {
	try {
		const committed = JSON.parse(committedData) as Record<string, unknown>;
		const { version: _cv, ...committedFields } = committed;
		const { version: _nv, ...newFields } = newData;
		return JSON.stringify(committedFields) !== JSON.stringify(newFields);
	} catch {
		return true;
	}
}

// Clean raw page text before sending to LLM — collapse whitespace, drop short nav lines
function cleanPageText(raw: string, maxChars = 3000): string {
	return raw
		.split("\n")
		.map(l => l.trim())
		.filter(l => l.length > 20) // drop nav items, single words, etc.
		.join("\n")
		.replace(/\n{3,}/g, "\n\n") // collapse blank lines
		.slice(0, maxChars);
}

// Extract all meaningful text from a snapshot data object for embedding
function buildEmbedText(data: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [key, val] of Object.entries(data)) {
		if (key === "version") continue;
		if (typeof val === "string" && val.trim()) parts.push(val.trim());
		else if (typeof val === "number") parts.push(String(val));
		else if (Array.isArray(val)) {
			for (const item of val) {
				if (typeof item === "string" && item.trim()) parts.push(item.trim());
			}
		}
	}
	return parts.join(" ");
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	return denom === 0 ? 0 : dot / denom;
}

// POST /api/snapshots/prompt — LLM-powered extraction into a pending snapshot
app.post("/prompt", async (c) => {
	try {
	if (!isLLMEnabled()) {
		return c.json({ error: "LLM not enabled. Set IMPACT_LLM=1 and ensure Ollama is running." }, 503);
	}

	const body = await c.req.json() as { url: string; pageText: string; userPrompt: string };
	const { url, pageText, userPrompt } = body;

	if (!url || !pageText || !userPrompt) {
		return c.json({ error: "url, pageText and userPrompt are required" }, 400);
	}

	const prompt = `You are a structured data extraction assistant. Given the following web page content and user instruction, extract information and return ONLY a valid JSON object.

URL: ${url}
Page content:
${pageText.slice(0, 3000)}

User instruction: ${userPrompt}

Return ONLY a JSON object with relevant fields. Example: {"key_points": ["...", "..."], "conclusion": "..."}`;

	let result: Record<string, unknown>;
	try {
		result = await callOllamaJson(prompt);
	} catch (e) {
		return c.json({ error: "LLM call failed", detail: String(e) }, 500);
	}

	// Find committed snapshot for this URL
	const committed = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "committed")))
		.get();

	const baseData: Record<string, unknown> = committed
		? (JSON.parse(committed.data) as Record<string, unknown>)
		: {};

	const domain = new URL(url).hostname;
	const version = generateVersion(url);
	const mergedData = { ...baseData, ...result, version };

	// Replace any existing pending for this URL
	db.delete(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "pending")))
		.run();

	const pending = db
		.insert(schema.pageSnapshots)
		.values({ url, domain, version, data: JSON.stringify(mergedData), status: "pending", capturedAt: Date.now() })
		.returning()
		.get();

	return c.json({ result, pendingId: pending.id, version });
	} catch (e) {
		console.error("[/prompt]", e);
		return c.json({ error: "Internal error", detail: String(e) }, 500);
	}
});

// GET /api/snapshots/search?q=text&limit=N&min_score=0.3 — semantic search
app.get("/search", async (c) => {
	const q = c.req.query("q");
	const limit = Number(c.req.query("limit") ?? "10");
	const minScore = Number(c.req.query("min_score") ?? "0.3");
	if (!q) return c.json({ error: "q required" }, 400);

	if (!isLLMEnabled()) {
		return c.json({ error: "LLM not enabled. Set IMPACT_LLM=1 and ensure Ollama is running." }, 503);
	}

	let queryEmbedding: number[];
	try {
		queryEmbedding = await generateEmbedding(q);
	} catch (e) {
		return c.json({ error: "Embedding failed", detail: String(e) }, 500);
	}

	const snapshots = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.status, "committed"), isNotNull(schema.pageSnapshots.embedding)))
		.all();

	const totalIndexed = snapshots.length;

	const scored = snapshots
		.map((s) => {
			const emb = JSON.parse(s.embedding!) as number[];
			return { ...s, score: cosineSimilarity(queryEmbedding, emb) };
		})
		.filter(s => s.score >= minScore)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ score, url, domain, version, data }) => ({ url, domain, version, data, score }));

	return c.json({ results: scored, totalIndexed });
});

// POST /api/snapshots/reindex — generate embeddings for committed snapshots missing them
app.post("/reindex", async (c) => {
	if (!isLLMEnabled()) {
		return c.json({ error: "LLM not enabled. Set IMPACT_LLM=1 and ensure Ollama is running." }, 503);
	}
	const force = c.req.query("force") === "true";

	const snapshots = db
		.select()
		.from(schema.pageSnapshots)
		.where(
			force
				? eq(schema.pageSnapshots.status, "committed")
				: and(eq(schema.pageSnapshots.status, "committed"), isNull(schema.pageSnapshots.embedding))
		)
		.all();

	let indexed = 0;
	const errors: string[] = [];
	for (const snap of snapshots) {
		try {
			const data = JSON.parse(snap.data) as Record<string, unknown>;
			const embedText = buildEmbedText(data);
			if (!embedText) continue;
			const emb = await generateEmbedding(embedText);
			db.update(schema.pageSnapshots)
				.set({ embedding: JSON.stringify(emb) })
				.where(eq(schema.pageSnapshots.id, snap.id))
				.run();
			indexed++;
		} catch (e) {
			errors.push(`${snap.url}: ${String(e)}`);
		}
	}

	return c.json({ indexed, total: snapshots.length, errors });
});

// POST /api/snapshots/ask — conversational Q&A against stored snapshot data
app.post("/ask", async (c) => {
	try {
		if (!isLLMEnabled()) {
			return c.json({ error: "LLM not enabled. Set IMPACT_LLM=1 and ensure Ollama is running." }, 503);
		}
		const body = await c.req.json() as { url: string; userPrompt: string; history?: { role: string; content: string }[] };
		const { url, userPrompt, history = [] } = body;
		if (!url || !userPrompt) return c.json({ error: "url and userPrompt required" }, 400);

		const committed = db
			.select()
			.from(schema.pageSnapshots)
			.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "committed")))
			.get();

		const pageText = committed?.pageText ? cleanPageText(committed.pageText, 3000) : null;
		const structuredData = committed
			? JSON.parse(committed.data) as Record<string, unknown>
			: null;

		const contextParts: string[] = [];
		if (pageText) contextParts.push(`Page content:\n${pageText.slice(0, 3000)}`);
		if (structuredData) {
			const { promptUsed: _, version: __, ...displayData } = structuredData;
			contextParts.push(`Extracted data:\n${JSON.stringify(displayData, null, 2)}`);
		}
		const contextStr = contextParts.length > 0
			? contextParts.join("\n\n")
			: "No stored data for this page yet.";

		const historyStr = history.length > 0
			? history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\n"
			: "";

		const prompt = `You are a helpful assistant answering questions about a web page.

URL: ${url}
${contextStr}

${historyStr}User: ${userPrompt}
Assistant:`;

		const answer = await callOllama(prompt);
		return c.json({ answer: answer.trim() });
	} catch (e) {
		return c.json({ error: "Ask failed", detail: String(e) }, 500);
	}
});

// POST /api/snapshots — submit a candidate snapshot
app.post("/", async (c) => {
	const body = await c.req.json();
	const { url, domain, data, pageText } = SnapshotSubmitSchema.parse(body);

	// LLM extraction using matched prompt config (or default prompt)
	if (isLLMEnabled() && pageText) {
		try {
			const promptTemplate = findPromptForUrl(url) ?? DEFAULT_EXTRACTION_PROMPT;
			const prompt = promptTemplate
				.replace("{url}", url)
				.replace("{pageText}", cleanPageText(pageText));

			const extracted = await callOllamaJson(prompt);
			// Merge LLM extraction over rule-based data; LLM takes precedence
			Object.assign(data, extracted);
			data.promptUsed = promptTemplate;
		} catch {
			// Non-fatal: continue with rule-based data only
		}
	}

	const committed = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "committed")))
		.get();

	const version = generateVersion(url);
	const dataWithVersion = { ...data, version };

	// First-time: auto-commit
	if (!committed) {
		let embedding: string | null = null;
		if (isLLMEnabled()) {
			try {
				const embedText = buildEmbedText(dataWithVersion);
				if (embedText) {
					const emb = await generateEmbedding(embedText);
					embedding = JSON.stringify(emb);
				}
			} catch {
				// Non-fatal
			}
		}
		const snapshot = db
			.insert(schema.pageSnapshots)
			.values({ url, domain, version, data: JSON.stringify(dataWithVersion), pageText: pageText ?? null, status: "committed", capturedAt: Date.now(), committedAt: Date.now(), embedding })
			.returning()
			.get();
		return c.json({ changed: false, snapshot, autoCommitted: true }, 201);
	}

	// Same data: no-op
	if (!dataChanged(committed.data, dataWithVersion)) {
		return c.json({ changed: false, committedVersion: committed.version });
	}

	// Different: store as pending (replace any existing pending for this URL)
	db.delete(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "pending")))
		.run();

	const pending = db
		.insert(schema.pageSnapshots)
		.values({ url, domain, version, data: JSON.stringify(dataWithVersion), pageText: pageText ?? null, status: "pending", capturedAt: Date.now() })
		.returning()
		.get();

	return c.json({ changed: true, pendingId: pending.id, version, committedVersion: committed.version }, 201);
});

// GET /api/snapshots?url=... — get current state for a URL
app.get("/", async (c) => {
	const url = c.req.query("url");
	if (!url) return c.json({ error: "url required" }, 400);

	const committed = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "committed")))
		.get();

	const pending = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "pending")))
		.orderBy(desc(schema.pageSnapshots.capturedAt))
		.get();

	return c.json({ committed: committed ?? null, pending: pending ?? null, changed: !!pending });
});

// POST /api/snapshots/reextract — re-run LLM extraction using stored pageText
app.post("/reextract", async (c) => {
	if (!isLLMEnabled()) {
		return c.json({ error: "LLM not enabled. Set IMPACT_LLM=1 and ensure Ollama is running." }, 503);
	}
	const body = await c.req.json() as { url: string };
	const { url } = body;
	if (!url) return c.json({ error: "url required" }, 400);

	// Use pageText from pending first, then committed
	const existing = db
		.select()
		.from(schema.pageSnapshots)
		.where(eq(schema.pageSnapshots.url, url))
		.orderBy(desc(schema.pageSnapshots.capturedAt))
		.get();

	if (!existing?.pageText) {
		return c.json({ error: "No stored page text for this URL. Save a snapshot from the extension first." }, 404);
	}

	const promptTemplate = findPromptForUrl(url) ?? DEFAULT_EXTRACTION_PROMPT;
	const prompt = promptTemplate
		.replace("{url}", url)
		.replace("{pageText}", cleanPageText(existing.pageText));

	let extracted: Record<string, unknown>;
	try {
		extracted = await callOllamaJson(prompt);
	} catch (e) {
		return c.json({ error: "LLM extraction failed", detail: String(e) }, 500);
	}
	extracted.promptUsed = promptTemplate;

	const committed = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "committed")))
		.get();

	const domain = new URL(url).hostname;
	const version = generateVersion(url);
	const dataWithVersion = { ...extracted, version };

	// Replace any existing pending
	db.delete(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, url), eq(schema.pageSnapshots.status, "pending")))
		.run();

	if (!committed) {
		// No committed yet — auto-commit
		const snapshot = db.insert(schema.pageSnapshots)
			.values({ url, domain, version, data: JSON.stringify(dataWithVersion), pageText: existing.pageText, status: "committed", capturedAt: Date.now(), committedAt: Date.now() })
			.returning().get();
		return c.json({ autoCommitted: true, snapshot });
	}

	const pending = db.insert(schema.pageSnapshots)
		.values({ url, domain, version, data: JSON.stringify(dataWithVersion), pageText: existing.pageText, status: "pending", capturedAt: Date.now() })
		.returning().get();

	return c.json({ pendingId: pending.id, version });
});

// POST /api/snapshots/:id/commit — commit a pending snapshot
// Accepts optional body { data } to override the pending data (for partial field selection)
app.post("/:id/commit", async (c) => {
	const id = Number(c.req.param("id"));

	const pending = db
		.select()
		.from(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.id, id), eq(schema.pageSnapshots.status, "pending")))
		.get();

	if (!pending) return c.json({ error: "Not found" }, 404);

	// Allow caller to supply merged data (partial field selection)
	let finalData = pending.data;
	try {
		const body = await c.req.json() as { data?: Record<string, unknown> };
		if (body?.data && typeof body.data === "object") {
			finalData = JSON.stringify(body.data);
		}
	} catch { /* no body — use pending data as-is */ }

	// Generate embedding on commit if LLM is enabled
	let embedding: string | null = pending.embedding ?? null;
	if (isLLMEnabled()) {
		try {
			const parsedData = JSON.parse(finalData) as Record<string, unknown>;
			const embedText = buildEmbedText(parsedData);
			if (embedText) {
				const emb = await generateEmbedding(embedText);
				embedding = JSON.stringify(emb);
			}
		} catch {
			// Non-fatal
		}
	}

	// Remove old committed and other pending for this URL
	db.delete(schema.pageSnapshots)
		.where(and(eq(schema.pageSnapshots.url, pending.url), not(eq(schema.pageSnapshots.id, id))))
		.run();

	// Commit with final data
	const committed = db
		.update(schema.pageSnapshots)
		.set({ status: "committed", committedAt: Date.now(), embedding, data: finalData })
		.where(eq(schema.pageSnapshots.id, id))
		.returning()
		.get();

	return c.json(committed);
});

export default app;
