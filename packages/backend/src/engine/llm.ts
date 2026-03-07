import type { Analyzer } from "./index.js";
import { desc, gte, sql } from "drizzle-orm";
import { schema } from "../db/client.js";
import type { Suggestion } from "@impact/shared";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

async function callOllama(prompt: string): Promise<string> {
	const res = await fetch(`${OLLAMA_URL}/api/generate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: OLLAMA_MODEL,
			prompt,
			stream: false,
			options: { temperature: 0.3, num_predict: 512 },
		}),
		signal: AbortSignal.timeout(30_000),
	});
	if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
	const data = await res.json() as { response: string };
	return data.response;
}

export const llmAnalyzer: Analyzer = {
	name: "llm",

	async run(db) {
		const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

		const visits = db
			.select({
				domain: schema.pageVisits.domain,
				visitCount: sql<number>`count(*)`.as("visit_count"),
				totalDuration: sql<number>`sum(${schema.pageVisits.durationMs})`.as("total_duration"),
			})
			.from(schema.pageVisits)
			.where(gte(schema.pageVisits.visitedAt, since))
			.groupBy(schema.pageVisits.domain)
			.orderBy(sql`visit_count DESC`)
			.limit(15)
			.all();

		const extractions = db
			.select({
				kind: schema.extractions.kind,
				value: schema.extractions.value,
				context: schema.extractions.context,
				url: schema.extractions.url,
			})
			.from(schema.extractions)
			.where(gte(schema.extractions.extractedAt, since))
			.orderBy(desc(schema.extractions.extractedAt))
			.limit(20)
			.all();

		if (visits.length === 0) return [];

		const visitLines = visits
			.map(v => `- ${v.domain}: ${v.visitCount} visits, ${Math.round((v.totalDuration ?? 0) / 60000)}min`)
			.join("\n");

		const extractionLines = extractions.length > 0
			? extractions
				.map(e => `- [${e.kind}] ${e.value}${e.context ? ` — "${e.context.slice(0, 80)}"` : ""} @ ${e.url}`)
				.join("\n")
			: "None";

		const prompt = `You are a smart browsing assistant. Based on the user's recent browsing activity, suggest 1-3 things they should remember or follow up on.

Recent visits (last 7 days):
${visitLines}

Extracted content from pages:
${extractionLines}

Respond ONLY with a JSON array. Each item must have:
- type: one of "revisit", "deadline", "price_change", "stale", "frequent"
- title: short title (max 60 chars)
- body: one sentence explanation (max 120 chars)
- url: a relevant URL from the data above
- priority: integer 1-5 (5 = most urgent)

Example: [{"type":"revisit","title":"Follow up on your GitHub PR","body":"You visited this 4 times this week.","url":"https://github.com/x","priority":3}]`;

		const raw = await callOllama(prompt);

		// Extract JSON array from response (model may wrap in markdown)
		const match = raw.match(/\[[\s\S]*\]/);
		if (!match) return [];

		const parsed = JSON.parse(match[0]) as Suggestion[];
		return parsed.map(s => ({ ...s, sourceAnalyzer: "llm" }));
	},
};
