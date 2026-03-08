import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, like, or, and } from "drizzle-orm";

const app = new Hono();

// GET / — list entries with optional ?q= search and ?domain= filter
app.get("/", (c) => {
	const q = c.req.query("q");
	const domain = c.req.query("domain");

	const baseQuery = db
		.select({
			id: schema.registryEntries.id,
			urlPattern: schema.registryEntries.urlPattern,
			domain: schema.registryEntries.domain,
			label: schema.registryEntries.label,
			description: schema.registryEntries.description,
			configBundle: schema.registryEntries.configBundle,
			contributor: schema.registryEntries.contributor,
			pushedAt: schema.registryEntries.pushedAt,
			pushCount: schema.registryEntries.pushCount,
		})
		.from(schema.registryEntries);

	const searchCondition = q
		? or(
			like(schema.registryEntries.label, `%${q}%`),
			like(schema.registryEntries.domain, `%${q}%`),
			like(schema.registryEntries.description, `%${q}%`),
		)
		: undefined;

	const domainCondition = domain ? eq(schema.registryEntries.domain, domain) : undefined;

	let entries;
	if (searchCondition && domainCondition) {
		entries = baseQuery.where(and(searchCondition, domainCondition)).all();
	} else if (searchCondition) {
		entries = baseQuery.where(searchCondition).all();
	} else if (domainCondition) {
		entries = baseQuery.where(domainCondition).all();
	} else {
		entries = baseQuery.all();
	}

	return c.json({ entries });
});

// GET /:id — get one entry including sampleData
app.get("/:id", (c) => {
	const id = Number(c.req.param("id"));
	const entry = db
		.select()
		.from(schema.registryEntries)
		.where(eq(schema.registryEntries.id, id))
		.get();

	if (!entry) return c.json({ error: "Not found" }, 404);
	return c.json(entry);
});

// POST / — upsert by urlPattern
app.post("/", async (c) => {
	try {
		const body = (await c.req.json()) as {
			urlPattern: string;
			domain: string;
			label: string;
			description?: string;
			configBundle: string;
			sampleData?: string;
			contributor?: string;
		};

		if (!body.urlPattern || !body.domain || !body.label || !body.configBundle) {
			return c.json({ error: "urlPattern, domain, label, and configBundle are required" }, 400);
		}

		const now = Date.now();
		const contributor = body.contributor ?? "anonymous";

		const existing = db
			.select()
			.from(schema.registryEntries)
			.where(eq(schema.registryEntries.urlPattern, body.urlPattern))
			.get();

		let entry;
		if (existing) {
			entry = db
				.update(schema.registryEntries)
				.set({
					domain: body.domain,
					label: body.label,
					description: body.description ?? existing.description,
					configBundle: body.configBundle,
					sampleData: body.sampleData ?? existing.sampleData,
					contributor,
					pushedAt: now,
					pushCount: existing.pushCount + 1,
				})
				.where(eq(schema.registryEntries.id, existing.id))
				.returning()
				.get();
		} else {
			entry = db
				.insert(schema.registryEntries)
				.values({
					urlPattern: body.urlPattern,
					domain: body.domain,
					label: body.label,
					description: body.description,
					configBundle: body.configBundle,
					sampleData: body.sampleData,
					contributor,
					pushedAt: now,
					pushCount: 1,
				})
				.returning()
				.get();
		}

		return c.json(entry, existing ? 200 : 201);
	} catch (e) {
		return c.json({ error: String(e) }, 500);
	}
});

// DELETE /:id — delete an entry
app.delete("/:id", (c) => {
	const id = Number(c.req.param("id"));
	db.delete(schema.registryEntries).where(eq(schema.registryEntries.id, id)).run();
	return c.json({ ok: true });
});

export default app;
