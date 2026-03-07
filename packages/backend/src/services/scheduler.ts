import { db, schema } from "../db/client.js";
import { frequencyAnalyzer, stalenessAnalyzer, deadlineAnalyzer, priceAnalyzer, llmAnalyzer } from "../engine/index.js";
import type { Analyzer } from "../engine/index.js";
import { and, eq } from "drizzle-orm";

const USE_LLM = process.env.IMPACT_LLM === "1";

const ANALYZERS: Analyzer[] = [
	frequencyAnalyzer,
	stalenessAnalyzer,
	deadlineAnalyzer,
	priceAnalyzer,
	...(USE_LLM ? [llmAnalyzer] : []),
];

const INTERVAL_MS = 5 * 60 * 1000;

function isDuplicate(url: string, type: string): boolean {
	return !!db
		.select({ id: schema.suggestions.id })
		.from(schema.suggestions)
		.where(and(
			eq(schema.suggestions.url, url),
			eq(schema.suggestions.type, type),
			eq(schema.suggestions.status, "active"),
		))
		.get();
}

export async function runAnalyzers() {
	let total = 0;
	for (const analyzer of ANALYZERS) {
		try {
			const suggestions = await Promise.resolve(analyzer.run(db));
			for (const s of suggestions) {
				if (!isDuplicate(s.url, s.type)) {
					db.insert(schema.suggestions)
						.values({ ...s, status: "active", createdAt: Date.now() })
						.run();
					total++;
				}
			}
		} catch (err) {
			console.error(`[engine] ${analyzer.name} failed:`, err);
		}
	}
	if (total > 0) console.log(`[engine] Generated ${total} new suggestions`);
}

export function startScheduler() {
	if (USE_LLM) console.log(`[engine] LLM analyzer enabled (${process.env.OLLAMA_MODEL ?? "llama3.2"})`);
	setTimeout(runAnalyzers, 10_000);
	setInterval(runAnalyzers, INTERVAL_MS);
	console.log(`[engine] Scheduler started (every ${INTERVAL_MS / 60000} min)`);
}
