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
		isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
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

export const pageSnapshots = sqliteTable(
	"page_snapshots",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		url: text("url").notNull(),
		domain: text("domain").notNull(),
		version: text("version").notNull(), // YYYY.MM.DD.NN
		data: text("data").notNull(), // JSON
		pageText: text("page_text"), // raw page content used for LLM
		pageHtml: text("page_html"), // raw HTML for Cheerio processing
		status: text("status").notNull().default("pending"), // "pending" | "committed"
		capturedAt: integer("captured_at").notNull(),
		committedAt: integer("committed_at"),
		embedding: text("embedding"), // JSON float array
	},
	(table) => [
		index("idx_snapshots_url_status").on(table.url, table.status),
		index("idx_snapshots_domain").on(table.domain),
	],
);

export const promptConfigs = sqliteTable(
	"prompt_configs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		urlPattern: text("url_pattern").notNull(), // glob pattern, e.g. "https://example.com/*"
		prompt: text("prompt").notNull(),          // template with {url} and {pageText} placeholders
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
);

export const pluginConfigs = sqliteTable(
	"plugin_configs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		pluginName: text("plugin_name").notNull(),
		urlPattern: text("url_pattern").notNull(),
		enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
		config: text("config"), // JSON: plugin-specific settings
		priority: integer("priority").notNull().default(0),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [index("idx_plugin_configs_name").on(table.pluginName)],
);

export const pluginLogs = sqliteTable(
	"plugin_logs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		snapshotId: integer("snapshot_id").references(() => pageSnapshots.id),
		pluginName: text("plugin_name").notNull(),
		url: text("url").notNull(),
		durationMs: integer("duration_ms").notNull(),
		inputData: text("input_data"),
		outputData: text("output_data"),
		error: text("error"),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		index("idx_plugin_logs_snapshot").on(table.snapshotId),
		index("idx_plugin_logs_plugin").on(table.pluginName),
	],
);
