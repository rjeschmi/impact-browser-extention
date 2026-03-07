import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const pageVisits = sqliteTable(
	"page_visits",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		url: text("url").notNull(),
		domain: text("domain").notNull(),
		title: text("title").notNull(),
		visitedAt: integer("visited_at").notNull(),
		durationMs: integer("duration_ms").notNull().default(0),
		referrerUrl: text("referrer_url"),
	},
	(table) => [index("idx_visits_domain").on(table.domain)],
);

export const extractions = sqliteTable(
	"extractions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		visitId: integer("visit_id").references(() => pageVisits.id),
		url: text("url").notNull(),
		kind: text("kind").notNull(), // price, date, deadline, todo, form, keyword
		value: text("value").notNull(),
		context: text("context"),
		metadata: text("metadata"), // JSON
		extractedAt: integer("extracted_at").notNull(),
	},
	(table) => [index("idx_extractions_url_kind").on(table.url, table.kind)],
);

export const suggestions = sqliteTable(
	"suggestions",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		type: text("type").notNull(), // revisit, deadline, price_change, stale, frequent
		title: text("title").notNull(),
		body: text("body").notNull(),
		url: text("url").notNull(),
		priority: integer("priority").notNull().default(3),
		status: text("status").notNull().default("active"),
		createdAt: integer("created_at").notNull(),
		snoozedUntil: integer("snoozed_until"),
		sourceAnalyzer: text("source_analyzer").notNull(),
	},
	(table) => [
		index("idx_suggestions_status_priority").on(table.status, table.priority),
	],
);

export const reminders = sqliteTable(
	"reminders",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		url: text("url"),
		title: text("title").notNull(),
		note: text("note").notNull().default(""),
		remindAt: integer("remind_at").notNull(),
		status: text("status").notNull().default("pending"),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		index("idx_reminders_status_remind_at").on(table.status, table.remindAt),
	],
);
