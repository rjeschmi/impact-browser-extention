import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const registryEntries = sqliteTable(
	"registry_entries",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		urlPattern: text("url_pattern").notNull().unique(),
		domain: text("domain").notNull(),
		label: text("label").notNull(),
		description: text("description"),
		configBundle: text("config_bundle").notNull(),
		sampleData: text("sample_data"),
		contributor: text("contributor").notNull().default("anonymous"),
		pushedAt: integer("pushed_at").notNull(),
		pushCount: integer("push_count").notNull().default(1),
	},
);
