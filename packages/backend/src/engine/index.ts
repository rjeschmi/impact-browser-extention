import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { schema } from "../db/client.js";
import type { Suggestion } from "@impact/shared";

export interface Analyzer {
	name: string;
	run(db: BunSQLiteDatabase<typeof schema>): Suggestion[] | Promise<Suggestion[]>;
}

export { frequencyAnalyzer } from "./frequency.js";
export { stalenessAnalyzer } from "./staleness.js";
export { deadlineAnalyzer } from "./deadlines.js";
export { priceAnalyzer } from "./prices.js";
export { llmAnalyzer } from "./llm.js";
